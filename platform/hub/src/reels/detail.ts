import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ScheduleEntry } from "../shared/types.js";
import { CHAT_FILE } from "./chat.js";
import { reelDirOf } from "./scanner.js";

const FOLDER = /^(\d+)-(.+)$/;
const SAFE = /^[A-Za-z0-9._-]+$/;
const MAX_TEXT = 200_000;

export interface ReelFile { name: string; size: number; dir: boolean }
export interface ReelDetail {
  key: string; brand: string; folder: string; n: number; name: string;
  mp4: string | null;
  /** Changes whenever the video is replaced: the page puts it in the video address so the new version loads. */
  version: string;
  caption: string; script: string[]; plan: string;
  hasCover: boolean; hasCode: boolean;
  files: ReelFile[];
  schedule: ScheduleEntry | null;
}

const text = (file: string): string => { try { return readFileSync(file, "utf8").slice(0, MAX_TEXT); } catch { return ""; } };

function sentences(file: string): string[] {
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { sentences?: unknown };
    return Array.isArray(raw.sentences) ? raw.sentences.filter((s): s is string => typeof s === "string") : [];
  } catch { return []; }
}

/** Everything the reel page shows about one reel folder. Null for a name that is not a reel folder. */
export function readReelDetail(reelsDir: string, folder: string, brand: string, scheduled: Record<string, ScheduleEntry>): ReelDetail | null {
  const m = FOLDER.exec(folder);
  if (!m || !SAFE.test(folder)) return null;
  const dir = reelDirOf(reelsDir, folder);
  try { if (!statSync(dir).isDirectory()) return null; } catch { return null; }
  const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith(".") && e.name !== CHAT_FILE);
  const files: ReelFile[] = entries.map((e) => ({ name: e.name, dir: e.isDirectory(), size: e.isDirectory() ? 0 : statSync(join(dir, e.name)).size }));
  const mp4 = entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".mp4")).map((e) => e.name).sort()[0] ?? null;
  const mtime = mp4 ? statSync(join(dir, mp4)).mtimeMs : 0;
  const key = `${brand}/${folder}`;
  return {
    key, brand, folder, n: Number(m[1]), name: m[2] as string, mp4,
    version: `${Math.round(mtime)}-${mp4 ? statSync(join(dir, mp4)).size : 0}`,
    caption: text(join(dir, "caption.md")), script: sentences(join(dir, "script.json")), plan: text(join(dir, "plan.md")),
    hasCover: existsSync(join(dir, "cover.png")), hasCode: existsSync(join(dir, "code")),
    files, schedule: scheduled[key] ?? null,
  };
}
