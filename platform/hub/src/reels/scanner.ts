import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Reel, ScheduleEntry } from "../shared/types.js";

export type ScheduleMap = Record<string, ScheduleEntry>;
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

/** Every reels/<brand>/<n>-<name>/ folder with its files and schedule state. `only` limits the scan to one brand. */
export function scanReels(root: string, scheduled: ScheduleMap, active: ReadonlySet<string> = new Set(), only?: string): Reel[] {
  const base = join(root, "reels");
  const out: Reel[] = [];
  for (const brand of only === undefined ? dirs(base) : dirs(base).filter((d) => d === only)) {
    for (const folder of dirs(join(base, brand))) {
      const m = FOLDER.exec(folder);
      if (!m) continue;
      const dir = join(base, brand, folder);
      const key = `${brand}/${folder}`;
      const cap = join(dir, "caption.md");
      out.push({
        key, brand, folder, n: Number(m[1]), name: m[2] as string, mp4: firstMp4(dir),
        hasCaption: existsSync(cap), captionStart: existsSync(cap) ? captionStart(cap) : "",
        hasCover: existsSync(join(dir, "cover.png")), schedule: scheduled[key] ?? null, scheduling: active.has(key),
      });
    }
  }
  return out.sort((a, b) => a.brand.localeCompare(b.brand) || a.n - b.n);
}

export type ReelFileKind = "mp4" | "cover" | "caption";

/** Absolute path of a reel file, or null when the key is unsafe or the file is missing. */
export function resolveReelFile(root: string, key: string, kind: ReelFileKind): string | null {
  const parts = key.split("/");
  if (parts.length !== 2 || !parts.every((p) => SAFE.test(p) && p !== "." && p !== "..")) return null;
  const dir = join(root, "reels", parts[0] as string, parts[1] as string);
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
