import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { defaultDataDir } from '../paths.js';

export interface ScheduledEntry {
  slot: string;
  scheduledAt: string;
  verified?: boolean;
}
export type ScheduledState = Readonly<Record<string, ScheduledEntry>>;

export function hubDataDir(): string {
  return defaultDataDir();
}
export const scheduledFile = (dir = hubDataDir()) => join(dir, 'scheduled.json');
export const shotsDir = (dir = hubDataDir()) => join(dir, 'shots');

/** State key: path after "/reels/" if present, else the folder name. */
export function reelKey(reelDir: string): string {
  const clean = reelDir.replace(/\/+$/, '');
  const i = clean.lastIndexOf('/reels/');
  return i >= 0 ? clean.slice(i + 7) : clean.split('/').pop()!;
}

export async function readState(file = scheduledFile()): Promise<ScheduledState> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    throw new Error('scheduled.json is not an object');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw e;
  }
}

export function isReelScheduled(state: ScheduledState, key: string): boolean {
  return key in state;
}
export function isSlotTaken(state: ScheduledState, slot: string): boolean {
  return Object.values(state).some((e) => e.slot === slot);
}
export function usedSlots(state: ScheduledState): string[] {
  return Object.values(state).map((e) => e.slot);
}

/** Returns a new state with the entry added (does not mutate). */
export function withEntry(state: ScheduledState, key: string, entry: ScheduledEntry): ScheduledState {
  return { ...state, [key]: entry };
}

export async function writeState(state: ScheduledState, file = scheduledFile()): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2) + '\n');
  await rename(tmp, file);
}

export async function recordScheduled(key: string, entry: ScheduledEntry, file = scheduledFile()): Promise<ScheduledState> {
  const next = withEntry(await readState(file), key, entry);
  await writeState(next, file);
  return next;
}
