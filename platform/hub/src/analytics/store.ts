import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { snapshotSchema, type Snapshot } from "./schemas.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const analyticsDir = (dataDir: string): string => join(dataDir, "analytics");

function atomicWrite(file: string, text: string): void {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(`${file}.tmp`, text);
  renameSync(`${file}.tmp`, file);
}

export function writeSnapshot(dataDir: string, date: string, snap: Snapshot): string {
  const file = join(analyticsDir(dataDir), `${date}.json`);
  atomicWrite(file, JSON.stringify(snap, null, 2));
  return file;
}

export const writeHooksCsv = (dataDir: string, csv: string): string => {
  const file = join(analyticsDir(dataDir), "hooks.csv");
  atomicWrite(file, csv);
  return file;
};

const datesOf = (dataDir: string, re: RegExp): string[] => {
  try { return readdirSync(analyticsDir(dataDir)).map((f) => re.exec(f)?.[1]).filter((d): d is string => !!d).sort(); } catch { return []; }
};

/** Dates of the saved snapshots, oldest first. */
export const listSnapshotDates = (dataDir: string): string[] => datesOf(dataDir, /^(\d{4}-\d{2}-\d{2})\.json$/);

export function readSnapshot(dataDir: string, date: string): Snapshot | null {
  if (!DATE.test(date)) return null;
  try {
    const parsed = snapshotSchema.safeParse(JSON.parse(readFileSync(join(analyticsDir(dataDir), `${date}.json`), "utf8")));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

export function latestSnapshot(dataDir: string): Snapshot | null {
  for (const d of [...listSnapshotDates(dataDir)].reverse()) {
    const s = readSnapshot(dataDir, d);
    if (s) return s;
  }
  return null;
}

export const writeReadout = (dataDir: string, date: string, markdown: string): string => {
  const file = join(analyticsDir(dataDir), `readout-${date}.md`);
  atomicWrite(file, markdown);
  return file;
};

export function latestReadout(dataDir: string): { date: string; markdown: string } | null {
  const date = datesOf(dataDir, /^readout-(\d{4}-\d{2}-\d{2})\.md$/).at(-1);
  if (!date) return null;
  const file = join(analyticsDir(dataDir), `readout-${date}.md`);
  return existsSync(file) ? { date, markdown: readFileSync(file, "utf8") } : null;
}

export interface BestTimesFile {
  at: string; enough: boolean; message: string; reelsUsed: number; basedOn: string; note: string;
  suggestions: { day: string; time: string; why: string }[]; defaults: { day: string; times: string[] }[];
}

export const writeBestTimes = (dataDir: string, v: BestTimesFile): string => {
  const file = join(analyticsDir(dataDir), "best-times.json");
  atomicWrite(file, JSON.stringify(v, null, 2));
  return file;
};

export function readBestTimes(dataDir: string): BestTimesFile | null {
  try { return JSON.parse(readFileSync(join(analyticsDir(dataDir), "best-times.json"), "utf8")) as BestTimesFile; } catch { return null; }
}
