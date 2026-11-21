import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const mockUrl = pathToFileURL(join(here, '../mock/instagram-mock.html')).href;
const CAPTION = 'Guests hate QR menus 🎁\n\nSave this and send it to a friend 😅\n\n#restaurant #tips';

let work: string;
let reelDir: string;
const updates: any[] = [];
const ctx = () => ({ update: (u: any) => updates.push(u), signal: new AbortController().signal });

async function makeReel(name: string) {
  const d = join(work, 'brand', 'acme', 'reels', name);
  await mkdir(d, { recursive: true });
  await writeFile(join(d, 'r.mp4'), 'fakevideo');
  await writeFile(join(d, 'cover.png'), 'fakepng');
  await writeFile(join(d, 'caption.md'), CAPTION + '\n');
  return d;
}

beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), 'sched-e2e-'));
  process.env.HUB_DATA = join(work, 'data');
  process.env.CHROME_PROFILE = join(work, 'profile');
  process.env.SCHED_HEADLESS = '1';
  // CHROME_PATH from the environment wins; otherwise the full Chromium that `npx playwright install chromium` put in the cache.
  process.env.CHROME_PATH ||= chromium.executablePath();
  process.env.CHROME_NO_SANDBOX = '1';
  reelDir = await makeReel('9-qr');
});
afterAll(async () => { (await import('../index.js')).closeBrowser(); });

describe('flow against the local mock', () => {
  it('schedules end to end across a month boundary and records state', async () => {
    const { runScheduleJob } = await import('../index.js');
    const now = new Date('2026-11-19T10:00:00Z');
    const res = await runScheduleJob({ id: 'j1', params: { reelDir, slot: '2026-12-03T16:30' } }, ctx(), { now, url: mockUrl });
    expect(res.verified).toBe(true);
    const st = JSON.parse(await readFile(join(work, 'data', 'scheduled.json'), 'utf8'));
    expect(st['acme/9-qr'].slot).toBe('2026-12-03T16:30');
    expect(st['acme/9-qr'].verified).toBe(true);
    expect(updates.map((u) => u.step).filter(Boolean)).toEqual([
      'Open dialog', 'Upload video', 'Crop 9:16', 'Upload cover', 'Caption', 'Date and time', 'Schedule', 'Verify',
    ]);
    expect(updates.at(-1).progress).toBe(1);
  });

  it('dismisses the known "shared as reels" notice that covers the Crop step, and nothing else', async () => {
    const { runScheduleJob, getContext } = await import('../index.js') as unknown as {
      runScheduleJob: (j: unknown, c: unknown, o: unknown) => Promise<{ verified: boolean }>;
      getContext?: () => Promise<import('playwright').BrowserContext>;
    };
    const { getContext: ctxOf } = await import('../browser.js');
    const browser = await ctxOf();
    const page = browser.pages()[0] ?? (await browser.newPage());
    await page.goto(mockUrl);
    await page.evaluate(() => localStorage.setItem('mock-notice', '1'));
    const reel = await makeReel('12-notice');
    const now = new Date('2026-11-19T10:00:00Z');
    const res = await runScheduleJob({ id: 'jn', params: { reelDir: reel, slot: '2026-12-09T17:30' } }, ctx(), { now, url: mockUrl });
    expect(res.verified).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('mock-notice-clicked'))).toBe('OK');
    void getContext;
    await page.evaluate(() => { localStorage.removeItem('mock-notice'); localStorage.removeItem('mock-notice-clicked'); });
  });

  it('does not click through an unknown dialog (terms): fails with ui_changed and a screenshot', async () => {
    const { runScheduleJob } = await import('../index.js');
    const { getContext: ctxOf } = await import('../browser.js');
    const browser = await ctxOf();
    const page = browser.pages()[0] ?? (await browser.newPage());
    await page.goto(mockUrl);
    await page.evaluate(() => localStorage.setItem('mock-notice', 'terms'));
    const reel = await makeReel('13-terms');
    const now = new Date('2026-11-19T10:00:00Z');
    await expect(runScheduleJob({ id: 'jt', params: { reelDir: reel, slot: '2026-12-10T17:30' } }, ctx(), { now, url: mockUrl, cropTimeoutMs: 4000 }))
      .rejects.toMatchObject({ code: 'ui_changed' });
    expect(await page.evaluate(() => localStorage.getItem('mock-notice-clicked'))).toBeNull();
    await page.evaluate(() => localStorage.removeItem('mock-notice'));
  });

  it('refuses the same reel again, a taken slot, and a too-soon slot', async () => {
    const { runScheduleJob } = await import('../index.js');
    const now = new Date('2026-11-19T10:00:00Z');
    await expect(runScheduleJob({ id: 'j2', params: { reelDir, slot: '2026-12-04T17:30' } }, ctx(), { now, url: mockUrl }))
      .rejects.toMatchObject({ code: 'already_scheduled' });
    const other = await makeReel('10-other');
    await expect(runScheduleJob({ id: 'j3', params: { reelDir: other, slot: '2026-12-03T16:30' } }, ctx(), { now, url: mockUrl }))
      .rejects.toMatchObject({ code: 'slot_taken' });
    await expect(runScheduleJob({ id: 'j4', params: { reelDir: other, slot: '2026-11-19T11:10' } }, ctx(), { now, url: mockUrl }))
      .rejects.toMatchObject({ code: 'too_soon' });
  });

  it('never presses Share and reports login_required when logged out', async () => {
    const { runScheduleJob, getSessionStatus } = await import('../index.js');
    const { getContext } = await import('../browser.js');
    const page = (await getContext()).pages()[0] ?? (await (await getContext()).newPage());
    await page.goto(mockUrl);
    expect(await page.evaluate(() => (window as any).__share)).toBe(0);

    const out = join(work, 'login.html');
    await writeFile(out, '<input name="username"><input type="password"><button>Log in</button>');
    const other = await makeReel('11-login');
    await expect(runScheduleJob({ id: 'j5', params: { reelDir: other, slot: '2026-12-05T17:30' } }, ctx(),
      { now: new Date('2026-11-19T10:00:00Z'), url: pathToFileURL(out).href })).rejects.toMatchObject({ code: 'login_required' });
    expect(typeof (await getSessionStatus()).loggedIn).toBe('boolean');
  });

  it('fails a broken page with step_failed and writes no screenshot', async () => {
    const { runScheduleJob } = await import('../index.js');
    const bad = join(work, 'broken.html');
    await writeFile(bad, '<button>Schedule content</button>');
    const other = await makeReel('12-broken');
    await expect(runScheduleJob({ id: 'j6', params: { reelDir: other, slot: '2026-12-06T17:30' } }, ctx(),
      { now: new Date('2026-11-19T10:00:00Z'), url: pathToFileURL(bad).href })).rejects.toMatchObject({ code: 'step_failed' });
    expect(existsSync(join(work, 'data', 'shots'))).toBe(false);
  }, 60000);
});

describe('list / reschedule / delete against the local mock', () => {
  const post = (date: string, h: number, mi: number, caption: string) => ({ date, h, mi, caption });
  async function seed(posts: unknown[]) {
    const { getContext } = await import('../browser.js');
    const page = await (await getContext()).newPage();
    await page.goto(mockUrl);
    await page.evaluate((p) => localStorage.setItem('mock-posts', JSON.stringify(p)), posts);
    await page.close();
  }
  const seeded = [
    post('2026-11-19', 7, 0, 'Alpha reel 👇\n\n📌 body #x'),
    post('2026-11-19', 16, 0, 'Bravo reel\n\n#y'),
    post('2026-11-29', 8, 0, 'Charlie reel'),
    post('2026-12-01', 17, 30, 'Delta reel'),
    post('2026-12-24', 12, 0, 'Far reel'),
  ];

  it('lists across weeks incl. month change, sorted, with ISO times, stopping after 2 empty weeks', async () => {
    const { listScheduled } = await import('../index.js');
    await seed(seeded);
    const all = await listScheduled({ weeks: 3 }, { url: mockUrl });
    expect(all.map((p) => `${p.scheduledAt} ${p.captionStart}`)).toEqual([
      '2026-11-19T07:00:00+01:00 Alpha reel 👇',
      '2026-11-19T16:00:00+01:00 Bravo reel',
      '2026-11-29T08:00:00+01:00 Charlie reel',
      '2026-12-01T17:30:00+01:00 Delta reel',
    ]);
    expect(new Set(all.map((p) => p.id)).size).toBe(4);
    // the weeks of Dec 6 and Dec 13 are empty: the walk stops before Far reel (Dec 24)
    const six = await listScheduled({}, { url: mockUrl });
    expect(six.map((p) => p.captionStart)).not.toContain('Far reel');
  });

  it('reschedules a post, verifying it at the new time, and refuses too_soon / not_found', async () => {
    const { listScheduled, rescheduleScheduled } = await import('../index.js');
    await seed(seeded);
    const before = await listScheduled({ weeks: 3 }, { url: mockUrl });
    const delta = before.find((p) => p.captionStart === 'Delta reel')!;
    await rescheduleScheduled(delta, '2026-12-08T16:30', { url: mockUrl, now: new Date('2026-11-19T10:00:00Z') });
    const after = await listScheduled({ weeks: 4 }, { url: mockUrl });
    expect(after.find((p) => p.captionStart === 'Delta reel')!.scheduledAt).toBe('2026-12-08T16:30:00+01:00');
    expect(after).toHaveLength(4);
    await expect(rescheduleScheduled(delta, '2026-11-19T11:10', { url: mockUrl, now: new Date('2026-11-19T10:00:00Z') }))
      .rejects.toMatchObject({ code: 'too_soon' });
    await expect(rescheduleScheduled({ captionStart: 'Nope', scheduledAt: '2026-11-19T07:00:00+01:00' }, '2026-12-08T16:30', { url: mockUrl, now: new Date('2026-11-19T10:00:00Z') }))
      .rejects.toMatchObject({ code: 'not_found' });
  });

  it('deletes a post after the confirmation and honours abort', async () => {
    const { listScheduled, deleteScheduled } = await import('../index.js');
    await seed(seeded);
    const before = await listScheduled({ weeks: 3 }, { url: mockUrl });
    const charlie = before.find((p) => p.captionStart === 'Charlie reel')!;
    const ac = new AbortController();
    ac.abort();
    await expect(deleteScheduled(charlie, { url: mockUrl, signal: ac.signal })).rejects.toMatchObject({ code: 'cancelled' });
    expect((await listScheduled({ weeks: 3 }, { url: mockUrl })).length).toBe(4);
    await deleteScheduled(charlie, { url: mockUrl });
    const after = await listScheduled({ weeks: 3 }, { url: mockUrl });
    expect(after.map((p) => p.captionStart)).not.toContain('Charlie reel');
    expect(after).toHaveLength(3);
  });

  it('reports login_required for list when logged out', async () => {
    const { listScheduled } = await import('../index.js');
    const out = join(work, 'login2.html');
    await writeFile(out, '<input name="username"><input type="password">');
    await expect(listScheduled({}, { url: pathToFileURL(out).href })).rejects.toMatchObject({ code: 'login_required' });
  });
});
