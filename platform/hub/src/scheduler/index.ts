import { access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { closeBrowser, DEFAULT_PROFILE, detectLogin, getContext, IG_URL, openProfile, requireLogin } from './browser.js';
import { dropExpiredOffer, readCaption } from './caption.js';
import { humanDay } from '../brands/offer.js';
import { runCarouselFlow, runFlow } from './flow.js';
import { isValidSlotFormat, minutesAhead, MIN_LEAD_MINUTES } from './slots.js';
import {
  carouselKey, hubDataDir, isReelScheduled, isSlotTaken, readState, recordScheduled, reelKey, scheduledFile,
} from './state.js';
import { withLock } from './lock.js';
import { deleteImpl, listScheduledImpl, rescheduleImpl } from './ops.js';
import { SchedulerError, type JobContext, type SchedulerTarget, type ScheduleJob, type OpOptions, type ScheduledPost, type ScheduleResult } from './types.js';

export * from './types.js';
export { nextFreeSlots } from './slots.js';
export { closeBrowser };


async function findVideo(dir: string, name?: string): Promise<string> {
  if (name) return join(dir, name);
  const mp4s = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.mp4'));
  if (mp4s.length !== 1) throw new SchedulerError('bad_input', `Expected exactly one .mp4 in ${dir}, found ${mp4s.length}`);
  return join(dir, mp4s[0]);
}

export function runScheduleJob(
  job: ScheduleJob, ctx: JobContext, opts: { now?: Date; url?: string; cropTimeoutMs?: number } = {},
): Promise<ScheduleResult> {
  return withLock(() => runScheduleJobLocked(job, ctx, opts));
}

async function runScheduleJobLocked(
  job: ScheduleJob, ctx: JobContext, opts: { now?: Date; url?: string; cropTimeoutMs?: number } = {},
): Promise<ScheduleResult> {
  const { reelDir, slot, video } = job.params;
  const url = opts.url ?? IG_URL;
  if (!isValidSlotFormat(slot)) throw new SchedulerError('bad_input', `Bad slot "${slot}"`);
  if (minutesAhead(slot, opts.now ?? new Date()) < MIN_LEAD_MINUTES) {
    throw new SchedulerError('too_soon', `Slot ${slot} is less than ${MIN_LEAD_MINUTES} minutes ahead`);
  }
  const slides = Array.isArray(job.params.slides) ? job.params.slides.filter((n) => /^slide-\d+\.png$/.test(n)) : null;
  const key = slides ? carouselKey(reelDir) : reelKey(reelDir);
  const file = scheduledFile(ctx.target?.dataDir);
  const state = await readState(file);
  if (isReelScheduled(state, key)) throw new SchedulerError('already_scheduled', `${key} is already scheduled`);
  if (isSlotTaken(state, slot)) throw new SchedulerError('slot_taken', `Slot ${slot} is already taken`);

  if (slides) return runCarouselLocked(job, ctx, opts, { key, slides, file, state });
  const videoPath = await findVideo(reelDir, video);
  const coverPath = join(reelDir, 'cover.png');
  await access(coverPath).catch(() => { throw new SchedulerError('bad_input', `Missing ${coverPath}`); });
  const capName = typeof job.params.captionFile === 'string' && /^caption[A-Za-z0-9._-]*\.md$/.test(job.params.captionFile) ? job.params.captionFile : 'caption.md';
  const fileCaption = await readCaption(join(reelDir, capName));
  const offer = ctx.target?.offer;
  const { caption, dropped: offerLines } = dropExpiredOffer(fileCaption, slot, offer);

  // A reel is scheduled in the background (no window). If Instagram stops it before anything was scheduled, the same flow runs once more with a (minimized) window.
  const modes = process.env.SCHED_VISIBLE === '1' ? [true] : [false, true];
  let lastError: unknown;
  for (const visible of modes) {
    let scheduledOnInstagram = false;
    const page = await (await getContext(ctx.target?.profileDir, visible ? { visible: true, minimized: true } : {})).newPage();
    try {
      await requireLogin(page, url);
      const scheduledAt = new Date().toISOString();
      if (offerLines.length) ctx.update({ log: `The offer ended on ${humanDay(offer?.lastDay ?? '')}: the offer line was left out of the Instagram caption (caption.md is unchanged).` });
      await runFlow(page, {
        url, videoPath, coverPath, caption, slot, cropTimeoutMs: opts.cropTimeoutMs,
        onScheduled: async () => { scheduledOnInstagram = true; await recordScheduled(key, { slot, scheduledAt, verified: false }, file); },
      }, ctx);
      await recordScheduled(key, { slot, scheduledAt, verified: true }, file);
      return { reel: key, slot, scheduledAt, verified: true };
    } catch (e) {
      lastError = e;
      const retry = !visible && modes.length > 1 && !scheduledOnInstagram && e instanceof SchedulerError && ['ui_changed', 'step_failed'].includes(e.code);
      if (!retry) throw e;
      ctx.update({ log: `The background run stopped (${e.message.slice(0, 120)}): trying again with a window.` });
    } finally {
      await page.close().catch(() => undefined);
    }
  }
  throw lastError;
}

/** The alt texts in the order of the sorted slides (the job gives them in slide order). */
const orderedAlts = (slides: string[], alts: string[] | undefined): string[] => {
  if (!alts) return [];
  const order = slides.map((s, i) => ({ n: Number(/\d+/.exec(s)?.[0]), i })).sort((a, b) => a.n - b.n);
  return order.map((o) => String(alts[o.i] ?? ''));
};

interface CarouselArgs { key: string; slides: string[]; file: string; state: Awaited<ReturnType<typeof readState>> }

/** A carousel: the slides in order and the caption, scheduled as one post. Same checks and the same state file as a reel. */
async function runCarouselLocked(
  job: ScheduleJob, ctx: JobContext, opts: { now?: Date; url?: string; cropTimeoutMs?: number }, a: CarouselArgs,
): Promise<ScheduleResult> {
  const { reelDir, slot } = job.params;
  const url = opts.url ?? IG_URL;
  if (a.slides.length < 2) throw new SchedulerError('bad_input', 'A carousel needs at least two slides');
  const slidePaths = [...a.slides].sort((x, y) => Number(/\d+/.exec(x)?.[0]) - Number(/\d+/.exec(y)?.[0])).map((n) => join(reelDir, n));
  for (const f of slidePaths) await access(f).catch(() => { throw new SchedulerError('bad_input', `Missing ${f}`); });
  const capName = typeof job.params.captionFile === 'string' && /^caption[A-Za-z0-9._-]*\.md$/.test(job.params.captionFile) ? job.params.captionFile : 'caption.md';
  const { caption, dropped: offerLines } = dropExpiredOffer(await readCaption(join(reelDir, capName)), slot, ctx.target?.offer);

  const page = await (await getContext(ctx.target?.profileDir, { visible: true, minimized: true })).newPage();
  try {
    await requireLogin(page, url);
    const scheduledAt = new Date().toISOString();
    if (offerLines.length) ctx.update({ log: 'The offer had ended: the offer line was left out of the Instagram caption (caption.md is unchanged).' });
    await runCarouselFlow(page, {
      url, slidePaths, caption, slot, stepTimeoutMs: opts.cropTimeoutMs,
      alts: orderedAlts(job.params.slides ?? [], job.params.alts),
      onScheduled: async () => { await recordScheduled(a.key, { slot, scheduledAt, verified: false }, a.file); },
    }, ctx);
    await recordScheduled(a.key, { slot, scheduledAt, verified: true }, a.file);
    return { reel: a.key, slot, scheduledAt, verified: true };
  } finally {
    await page.close().catch(() => undefined);
  }
}

export function listScheduled(p: { weeks?: number; signal?: AbortSignal } = {}, opts: OpOptions = {}): Promise<ScheduledPost[]> {
  return withLock(() => listScheduledImpl({ ...opts, ...p }));
}
export function rescheduleScheduled(post: { captionStart: string; scheduledAt: string }, newAt: string, opts: OpOptions = {}): Promise<void> {
  return withLock(() => rescheduleImpl(post, newAt, opts));
}
export function deleteScheduled(post: { captionStart: string; scheduledAt: string }, opts: OpOptions = {}): Promise<void> {
  return withLock(() => deleteImpl(post, opts));
}

/** Opening another brand's profile closes the open browser, so it waits for the running flow; the same profile needs no wait. */
const switching = (t?: SchedulerTarget): boolean => {
  const open = openProfile();
  return open !== null && open !== (t?.profileDir ?? DEFAULT_PROFILE);
};
const maybeLocked = <T>(t: SchedulerTarget | undefined, fn: () => Promise<T>): Promise<T> => (switching(t) ? withLock(fn) : fn());

export function getSessionStatus(target?: SchedulerTarget): Promise<{ loggedIn: boolean; checkedAt: string; error?: string }> {
  return maybeLocked(target, async () => {
    const checkedAt = new Date().toISOString();
    try {
      const page = await (await getContext(target?.profileDir)).newPage();
      try { return { loggedIn: await detectLogin(page), checkedAt }; } finally { await page.close().catch(() => undefined); }
    } catch (e) {
      return { loggedIn: false, checkedAt, error: (e as Error).message };
    }
  });
}

/** Opens (or focuses) the Instagram login window of a brand, so the person can log in there. */
export function openLoginWindow(target?: SchedulerTarget): Promise<void> {
  return maybeLocked(target, async () => {
    const ctx = await getContext(target?.profileDir, { visible: true });
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded' });
    await page.bringToFront();
  });
}

export { hubDataDir };
