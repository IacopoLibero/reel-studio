import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Reel, ScheduleEntry } from "../shared/types.js";

export type ScheduleMap = Record<string, ScheduleEntry>;

/** "YYYY-MM-DD HH:mm" now, in a time zone: the same shape as a schedule entry's `at`, so the two compare as text. */
export function nowLocal(tz: string, now: Date = new Date()): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(now)) if (p.type !== "literal") o[p.type] = p.value;
  return `${o.year}-${o.month}-${o.day} ${o.hour}:${o.minute}`;
}

/**
 * What the banner of a reel says. Nothing in the hub writes "posted": Instagram publishes a scheduled post at its time by itself, so a scheduled reel whose time has passed is posted.
 * A reel that is not complete (MP4, caption and cover) is "incomplete"; one with an Instagram job running is "scheduling".
 */
export type ReelState = "incomplete" | "to-schedule" | "scheduling" | "scheduled" | "posted";
export function reelState(r: Pick<Reel, "mp4" | "hasCaption" | "hasCover" | "schedule" | "scheduling">, now: string | null): ReelState {
  if (r.schedule) return r.schedule.status === "posted" || (now !== null && r.schedule.at <= now) ? "posted" : "scheduled";
  if (r.scheduling) return "scheduling";
  return r.mp4 && r.hasCaption && r.hasCover ? "to-schedule" : "incomplete";
}
const FOLDER = /^(\d+)-(.+)$/;
const SAFE = /^[A-Za-z0-9._-]+$/;

const dirs = (p: string): string[] => {
  try { return readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; }
};

const firstMp4 = (dir: string): string | null => {
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".mp4")).sort();
  return files[0] ?? null;
};

function captionStart(file: string): string {
  const first = readFileSync(file, "utf8").split("\n").find((l) => l.trim()) ?? "";
  return first.length > 120 ? `${first.slice(0, 120)}…` : first;
}

/** The folder name of a reel key "<brand>/<folder>" (an empty string for a key that is not one). */
export const folderOfKey = (key: string): string => (key.split("/").length === 2 ? (key.split("/")[1] as string) : "");

/** The folder of one reel inside a brand's reels folder (<brand>/reels/<n>-<name>/). */
export const reelDirOf = (reelsDir: string, folder: string): string => join(reelsDir, folder);

/** Every <n>-<name>/ folder of one brand's reels folder, with its files and schedule state. */
export function scanReels(reelsDir: string, brand: string, scheduled: ScheduleMap, active: ReadonlySet<string> = new Set(), now: string | null = null): Reel[] {
  const out: Reel[] = [];
  for (const folder of dirs(reelsDir)) {
    const m = FOLDER.exec(folder);
    if (!m) continue;
    const dir = reelDirOf(reelsDir, folder);
    const key = `${brand}/${folder}`;
    const cap = join(dir, "caption.md");
    const reel = {
      key, brand, folder, n: Number(m[1]), name: m[2] as string, mp4: firstMp4(dir),
      hasCaption: existsSync(cap), captionStart: existsSync(cap) ? captionStart(cap) : "",
      hasCover: existsSync(join(dir, "cover.png")), schedule: scheduled[key] ?? null, scheduling: active.has(key),
    };
    out.push({ ...reel, state: reelState(reel, now) });
  }
  return out.sort((a, b) => a.n - b.n);
}

export type ReelFileKind = "mp4" | "cover" | "caption";

/** Absolute path of a file of a reel (given the brand's reels folder and the reel's folder name), or null when the name is unsafe or the file is missing. */
export function resolveReelFile(reelsDir: string, folder: string, kind: ReelFileKind): string | null {
  if (!SAFE.test(folder) || folder === "." || folder === "..") return null;
  const dir = reelDirOf(reelsDir, folder);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return null;
  const name = kind === "mp4" ? firstMp4(dir) : kind === "cover" ? "cover.png" : "caption.md";
  if (!name) return null;
  const file = join(dir, name);
  return existsSync(file) ? file : null;
}

const entryFrom = (v: unknown): ScheduleEntry | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const raw = o.at ?? o.slot ?? (o.date && o.time ? `${o.date} ${o.time}` : undefined);
  if (typeof raw !== "string") return null;
  const at = raw.replace("T", " ");
  return { at, status: typeof o.status === "string" ? o.status : "scheduled", ...(typeof o.jobId === "string" ? { jobId: o.jobId } : {}) };
};

/** Reads data/scheduled.json (written by the scheduler: { "<brand>/<folder>": { slot: "YYYY-MM-DDTHH:mm", ... } }). Also accepts `at` and arrays with a `reel` field. */
export function readScheduled(file: string): ScheduleMap {
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(file, "utf8")); } catch { return {}; }
  const out: ScheduleMap = {};
  const pairs: [string, unknown][] = Array.isArray(raw)
    ? raw.map((e) => [String((e as Record<string, unknown>)?.reel ?? ""), e])
    : raw && typeof raw === "object" ? Object.entries(raw) : [];
  for (const [k, v] of pairs) {
    const e = entryFrom(v);
    if (k && e) out[k] = e;
  }
  return out;
}
