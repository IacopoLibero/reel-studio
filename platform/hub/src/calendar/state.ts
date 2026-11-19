import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { toLocal } from "./merge.js";

type Doc = Record<string, Record<string, unknown>>;

function read(file: string): Doc {
  if (!existsSync(file)) return {};
  try { const p = JSON.parse(readFileSync(file, "utf8")); return p && typeof p === "object" && !Array.isArray(p) ? p : {}; } catch { return {}; }
}
function write(file: string, doc: Doc): void { writeFileSync(`${file}.tmp`, JSON.stringify(doc, null, 2)); renameSync(`${file}.tmp`, file); }

/** Keeps data/scheduled.json in step after a reschedule: the reel's slot becomes the new local time. */
export function applyReschedule(file: string, reelKey: string | null, newAt: string, tz: string): void {
  if (!reelKey) return;
  const doc = read(file);
  const cur = doc[reelKey];
  if (!cur) return;
  const { date, time } = toLocal(newAt, tz);
  write(file, { ...doc, [reelKey]: { ...cur, slot: `${date}T${time}` } });
}

/** Removes a deleted post's reel from data/scheduled.json so it can be scheduled again. */
export function applyDelete(file: string, reelKey: string | null): void {
  if (!reelKey) return;
  const doc = read(file);
  if (!(reelKey in doc)) return;
  const { [reelKey]: _gone, ...rest } = doc;
  write(file, rest);
}
