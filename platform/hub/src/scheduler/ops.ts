import type { Locator, Page } from 'playwright';
import { getContext, IG_URL, requireLogin } from './browser.js';
import { isoToWall, norm, parseWeek, parseTimeLabel, resolveWeekDates, type RawWeek } from './calendar.js';
import { setDateTime } from './flow.js';
import { minutesAhead, MIN_LEAD_MINUTES } from './slots.js';
import { SchedulerError, type OpOptions, type ScheduledPost } from './types.js';

const MAX_WEEKS_WALK = 60;

function check(signal?: AbortSignal) {
  if (signal?.aborted) throw new SchedulerError('cancelled', 'Cancelled');
}

/** Opens an own page in the shared context, requires a login and always closes the page. */
export async function withCalendarPage<T>(op: string, opts: OpOptions, fn: (page: Page, url: string) => Promise<T>): Promise<T> {
  const url = opts.url ?? IG_URL;
  const page = await (await getContext(opts.target?.profileDir)).newPage();
  try {
    await requireLogin(page, url);
    return await fn(page, url);
  } catch (e) {
    if (e instanceof SchedulerError) throw e;
    throw new SchedulerError('ui_changed', `${op}: ${(e as Error).message}`);
  } finally {
    await page.close().catch(() => undefined);
  }
}

export async function readWeek(page: Page): Promise<RawWeek> {
  return page.evaluate(() => {
    const lines = document.body.innerText.split('\n').map((l) => l.trim());
    const hi = lines.findIndex((l) => /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d+$/.test(l));
    const titleLine = lines.slice(0, hi < 0 ? lines.length : hi).find((l) => /\d{4}/.test(l)) ?? '';
    const headers = [...document.querySelectorAll('*')]
      .filter((e) => e.children.length === 0 && /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d+$/.test((e.textContent ?? '').trim()))
      .map((e) => { const r = e.getBoundingClientRect(); return { label: (e.textContent ?? '').trim(), left: r.left, right: r.right }; });
    const posts = [...document.querySelectorAll('[role=button]')]
      .filter((b) => /\d{1,2}:\d{2} [AP]M\s*$/.test((b as HTMLElement).innerText ?? ''))
      .filter((b) => !b.parentElement?.closest('[role=button]'))
      .map((b) => { const r = b.getBoundingClientRect(); return { text: (b as HTMLElement).innerText, left: r.left, right: r.right }; });
    return { title: titleLine, headers, posts };
  });
}

const weekKey = async (page: Page) => (await readWeek(page)).headers.map((h) => h.label).join(',') + (await readWeek(page)).title;

/** Waits until the number of post buttons stops changing (they load after the headers). */
async function settle(page: Page): Promise<RawWeek> {
  let prev = -1;
  let week = await readWeek(page);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(500);
    week = await readWeek(page);
    if (week.posts.length === prev && i >= 1) break;
    prev = week.posts.length;
  }
  return week;
}

export async function nextWeek(page: Page): Promise<void> {
  const before = await weekKey(page);
  await page.getByRole('button', { name: 'Next week' }).first().click();
  const start = Date.now();
  while ((await weekKey(page)) === before) {
    if (Date.now() - start > 15000) throw new SchedulerError('ui_changed', 'The calendar did not move to the next week');
    await page.waitForTimeout(250);
  }
}

export async function goHome(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Schedule content' }).first().waitFor({ timeout: 20000 });
}

/** Walks the weeks forward from the current one. `visit` returns true to stop. */
async function walkWeeks(page: Page, max: number, signal: AbortSignal | undefined, visit: (w: RawWeek, i: number) => Promise<boolean>) {
  for (let i = 0; i < max; i++) {
    check(signal);
    if (i > 0) await nextWeek(page);
    const week = await settle(page);
    if (week.headers.length !== 7) throw new SchedulerError('ui_changed', 'Week header not found');
    if (await visit(week, i)) return;
  }
}

export async function listOnPage(page: Page, url: string, weeks: number, signal?: AbortSignal): Promise<ScheduledPost[]> {
  await goHome(page, url);
  const out: ScheduledPost[] = [];
  let empty = 0;
  await walkWeeks(page, weeks, signal, async (w) => {
    const posts = parseWeek(w);
    out.push(...posts);
    empty = posts.length ? 0 : empty + 1;
    return empty >= 2;
  });
  return out.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

export async function listScheduledImpl(params: { weeks?: number; signal?: AbortSignal } & OpOptions): Promise<ScheduledPost[]> {
  const weeks = params.weeks ?? 6;
  return withCalendarPage('list', params, (page, url) => listOnPage(page, url, weeks, params.signal));
}

/** Walks from the current week to the post's week; returns how many posts match the caption start at that time. */
export async function findPostOnCalendar(page: Page, url: string, captionStart: string, iso: string): Promise<number> {
  await goHome(page, url);
  return (await locatePost(page, captionStart, iso)).count;
}

async function locatePost(page: Page, captionStart: string, iso: string, signal?: AbortSignal): Promise<{ count: number; click: () => Promise<void> }> {
  let count = 0;
  let idx = -1;
  await walkWeeks(page, MAX_WEEKS_WALK, signal, async (w) => {
    const posts = parseWeek(w);
    const hit = posts.map((p, i) => ({ p, i })).filter(({ p }) => p.scheduledAt === iso && norm(p.captionStart).startsWith(norm(captionStart).slice(0, 40)));
    if (hit.length) { count = hit.length; idx = hit[0].i; return true; }
    // stop once this week covers the wanted day
    const nums = w.headers.map((h) => Number(/(\d+)$/.exec(h.label)![1]));
    const lastDay = resolveWeekDates(w.title, nums).at(-1)!;
    const lastWall = `${lastDay.year}-${String(lastDay.month).padStart(2, '0')}-${String(lastDay.day).padStart(2, '0')}`;
    return lastWall >= isoToWall(iso).slice(0, 10);
  });
  return {
    count,
    click: async () => {
      if (idx < 0) throw new SchedulerError('not_found', 'Post not found on the calendar');
      const week = await readWeek(page);
      const parsed = parseWeek(week);
      const target = parsed.findIndex((p) => p.scheduledAt === iso && norm(p.captionStart).startsWith(norm(captionStart).slice(0, 40)));
      // parseWeek skips posts outside the columns, so map back to the raw index by order
      const rawIdx = rawIndexOf(week, target);
      await page.locator('[role=button]').filter({ hasText: /\d{1,2}:\d{2} [AP]M\s*$/ }).nth(rawIdx).click();
    },
  };
}

function rawIndexOf(week: RawWeek, parsedIndex: number): number {
  let seen = -1;
  for (let i = 0; i < week.posts.length; i++) {
    const mid = (week.posts[i].left + week.posts[i].right) / 2;
    if (week.headers.some((h) => mid >= h.left && mid <= h.right)) seen += 1;
    if (seen === parsedIndex) return i;
  }
  throw new SchedulerError('not_found', 'Post vanished while opening it');
}

async function openPost(page: Page, url: string, post: { captionStart: string; scheduledAt: string }, signal?: AbortSignal): Promise<Locator> {
  await goHome(page, url);
  const loc = await locatePost(page, post.captionStart, post.scheduledAt, signal);
  if (loc.count === 0) throw new SchedulerError('not_found', `No post "${post.captionStart}" at ${post.scheduledAt}`);
  await loc.click();
  const dialog = page.getByRole('dialog').last();
  await dialog.waitFor({ state: 'visible', timeout: 15000 });
  await dialog.getByRole('button', { name: 'Save', exact: true }).waitFor({ timeout: 15000 }).catch(() => {
    throw new SchedulerError('ui_changed', 'The Edit dialog has no Save button');
  });
  return dialog;
}

export async function rescheduleImpl(post: { captionStart: string; scheduledAt: string }, newAt: string, opts: OpOptions = {}): Promise<void> {
  const wall = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(newAt) ? newAt : isoToWall(newAt);
  if (minutesAhead(wall, opts.now ?? new Date()) < MIN_LEAD_MINUTES) {
    throw new SchedulerError('too_soon', `New time ${wall} is less than ${MIN_LEAD_MINUTES} minutes ahead`);
  }
  const { wallToIso } = await import('./calendar.js');
  await withCalendarPage('reschedule', opts, async (page, url) => {
    const dialog = await openPost(page, url, post, opts.signal);
    check(opts.signal);
    await setDateTime(page, wall);
    check(opts.signal);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click(); // never Share
    await dialog.waitFor({ state: 'hidden', timeout: 45000 });
    const found = await findPostOnCalendar(page, url, post.captionStart, wallToIso(wall));
    if (found !== 1) throw new SchedulerError('verify_failed', `After saving, ${found} posts show at ${wall}`);
  });
}

export async function deleteImpl(post: { captionStart: string; scheduledAt: string }, opts: OpOptions = {}): Promise<void> {
  await withCalendarPage('delete', opts, async (page, url) => {
    const dialog = await openPost(page, url, post, opts.signal);
    check(opts.signal);
    await dialog.getByRole('button', { name: 'Delete scheduled content', exact: true }).click();
    const confirm = page.getByRole('dialog').last().getByRole('button', { name: /^Delete$/ });
    await confirm.waitFor({ timeout: 15000 }).catch(() => {
      throw new SchedulerError('ui_changed', 'Delete confirmation not found');
    });
    check(opts.signal);
    await confirm.click();
    await page.getByRole('dialog').first().waitFor({ state: 'hidden', timeout: 30000 }).catch(() => undefined);
    const left = await findPostOnCalendar(page, url, post.captionStart, post.scheduledAt);
    if (left !== 0) throw new SchedulerError('verify_failed', 'The post is still on the calendar after deleting');
  });
}

export { parseTimeLabel };
