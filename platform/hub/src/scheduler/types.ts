export interface JobUpdate {
  progress?: number;
  step?: string;
  stepIndex?: number;
  /** One log line to append. */
  log?: string;
}

/** The brand a browser flow works for: its own Instagram profile, data folder and offer rule. Without one the legacy single-brand paths apply. */
export interface SchedulerTarget {
  slug: string;
  /** Chrome user-data folder holding this brand's Instagram login. */
  profileDir: string;
  /** The brand's data folder: scheduled.json. */
  dataDir: string;
  /** The brand's offer rule: after its last day the offer line is left out of the caption. */
  offer?: { lastDay: string | null; pattern: RegExp | null };
}

export interface JobContext {
  update(patch: JobUpdate): void;
  signal: AbortSignal;
  settings?: Record<string, unknown>;
  target?: SchedulerTarget;
}

export interface ScheduleJobParams {
  /** Absolute path of the reel folder (reels/<brand>/<n>-<name>). */
  reelDir: string;
  /** Slot as Europe/Rome wall time, "YYYY-MM-DDTHH:mm". */
  slot: string;
  /** Optional mp4 file name inside reelDir (default: the only *.mp4). */
  video?: string;
  /** Optional caption file name inside reelDir (default: caption.md), e.g. a copy without an expired offer line. */
  captionFile?: string;
  /** Set for a carousel: the slide files (slide-1.png, ...) in reelDir, in order. reelDir is then the carousel folder. */
  slides?: string[];
  /** Alt text of each slide, in the same order (Instagram's Accessibility section). Empty entries are left blank. */
  alts?: string[];
}

export interface ScheduleJob {
  id: string;
  params: ScheduleJobParams;
}

export interface ScheduleResult {
  reel: string;
  slot: string;
  scheduledAt: string;
  verified: boolean;
}

export type SchedulerErrorCode =
  | 'login_required'
  | 'already_scheduled'
  | 'slot_taken'
  | 'too_soon'
  | 'too_far'
  | 'bad_input'
  | 'caption_mismatch'
  | 'verify_failed'
  | 'cancelled'
  | 'not_found'
  | 'ui_changed'
  | 'step_failed';

export class SchedulerError extends Error {
  constructor(public readonly code: SchedulerErrorCode, message: string) {
    super(message);
    this.name = 'SchedulerError';
  }
}

export const CAROUSEL_STEPS = [
  'Open dialog',
  'Upload images',
  'Crop',
  'Edit',
  'Caption',
  'Date and time',
  'Schedule',
  'Verify',
] as const;

export const STEPS = [
  'Open dialog',
  'Upload video',
  'Crop 9:16',
  'Upload cover',
  'Caption',
  'Date and time',
  'Schedule',
  'Verify',
] as const;

/** A post read from the real Instagram calendar. */
export interface ScheduledPost {
  /** Stable hash of captionStart + scheduledAt. */
  id: string;
  /** ISO 8601 with the Europe/Rome offset, e.g. 2026-11-19T16:00:00+01:00. */
  scheduledAt: string;
  /** First line of the caption, at most 60 chars. */
  captionStart: string;
  /** Small data URL, optional (not filled by the scheduler today). */
  thumbnail?: string;
  /** Filled by the hub (matched against caption.md), never by the scheduler. */
  reelFolder?: string;
}

export interface OpOptions {
  signal?: AbortSignal;
  target?: SchedulerTarget;
  /** Test hooks. */
  now?: Date;
  url?: string;
}
