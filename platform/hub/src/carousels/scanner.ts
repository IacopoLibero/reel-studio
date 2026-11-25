import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { readAltTexts } from "./alt.js";
import { missingSource } from "./source.js";
import { reelState, type ReelState } from "../reels/scanner.js";
import type { ScheduleEntry } from "../shared/types.js";

const FOLDER = /^(\d+)-(.+)$/;
const SAFE = /^[A-Za-z0-9._-]+$/;
const SLIDE = /^slide-(\d+)\.png$/;

export const CAROUSEL_STYLES = ["2d", "3d"] as const;
export type CarouselStyle = (typeof CAROUSEL_STYLES)[number];

/** What the job writes next to the slides: carousel.json. Anything missing or wrong falls back to what the folder itself says. */
const metaSchema = z.object({ style: z.enum(CAROUSEL_STYLES).default("2d"), topic: z.string().max(600).default(""), title: z.string().max(200).default("") });
export type CarouselMeta = z.infer<typeof metaSchema>;

export interface Carousel {
  key: string; brand: string; folder: string; n: number; name: string; style: CarouselStyle; topic: string; title: string;
  slides: string[]; hasCaption: boolean; captionStart: string; hasPlan: boolean;
  /** Alt text written for every slide (alt.json). */
  hasAlt: boolean;
  /** The files that let one slide be drawn again are in the folder. */
  hasSource: boolean;
  /** The Instagram slot once scheduled, and what the banner says: posted once the slot has passed, as for a reel. */
  schedule: ScheduleEntry | null;
  state: ReelState;
}
export interface CarouselDetail extends Carousel { caption: string; plan: string; files: { name: string; size: number; dir: boolean }[] }

const dirs = (p: string): string[] => { try { return readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; } };
export const carouselDirOf = (carouselsDir: string, folder: string): string => join(carouselsDir, folder);

/** The slide files of a carousel in order: slide-1.png, slide-2.png... (a gap ends the list: a carousel with slide 3 missing has two slides). */
export function slideFiles(dir: string): string[] {
  let names: string[] = [];
  try { names = readdirSync(dir); } catch { return []; }
  const nums = new Set(names.map((f) => SLIDE.exec(f)?.[1]).filter((x): x is string => !!x).map(Number));
  const out: string[] = [];
  for (let i = 1; nums.has(i); i++) out.push(`slide-${i}.png`);
  return out;
}

export function readMeta(dir: string): CarouselMeta {
  try { return metaSchema.parse(JSON.parse(readFileSync(join(dir, "carousel.json"), "utf8"))); } catch { return metaSchema.parse({}); }
}

const firstLine = (file: string): string => {
  const first = readFileSync(file, "utf8").split("\n").find((l) => l.trim()) ?? "";
  return first.length > 120 ? `${first.slice(0, 120)}…` : first;
};

/** The key a scheduled carousel has in scheduled.json: it cannot meet a reel folder. */
export const carouselScheduleKey = (brand: string, folder: string): string => `${brand}/carousels/${folder}`;

function summary(carouselsDir: string, brand: string, folder: string, scheduled: Readonly<Record<string, ScheduleEntry>> = {}, active: ReadonlySet<string> = new Set(), now: string | null = null): Carousel | null {
  const m = FOLDER.exec(folder);
  if (!m) return null;
  const dir = carouselDirOf(carouselsDir, folder);
  const meta = readMeta(dir); const cap = join(dir, "caption.md");
  const slides = slideFiles(dir);
  const schedule = scheduled[carouselScheduleKey(brand, folder)] ?? null;
  const scheduling = active.has(carouselScheduleKey(brand, folder));
  return {
    key: `${brand}/${folder}`, brand, folder, n: Number(m[1]), name: m[2] as string, style: meta.style, topic: meta.topic, title: meta.title,
    slides, hasCaption: existsSync(cap), captionStart: existsSync(cap) ? firstLine(cap) : "", hasPlan: existsSync(join(dir, "plan.md")),
    hasAlt: readAltTexts(dir, slides.length) !== null, hasSource: missingSource(dir, meta.style).length === 0, schedule,
    state: reelState({ mp4: slides.length >= 2 ? "slides" : null, hasCaption: existsSync(cap), hasCover: true, schedule, scheduling }, now),
  };
}

/** Every <n>-<name>/ folder of one brand's carousels folder. */
export function scanCarousels(carouselsDir: string, brand: string, scheduled: Readonly<Record<string, ScheduleEntry>> = {}, active: ReadonlySet<string> = new Set(), now: string | null = null): Carousel[] {
  return dirs(carouselsDir).map((f) => summary(carouselsDir, brand, f, scheduled, active, now)).filter((c): c is Carousel => c !== null).sort((a, b) => a.n - b.n);
}

export function readCarouselDetail(carouselsDir: string, folder: string, brand: string, scheduled: Readonly<Record<string, ScheduleEntry>> = {}, now: string | null = null): CarouselDetail | null {
  if (!SAFE.test(folder) || folder === "." || folder === "..") return null;
  const dir = carouselDirOf(carouselsDir, folder);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return null;
  const base = summary(carouselsDir, brand, folder, scheduled, new Set(), now);
  if (!base) return null;
  const read = (f: string) => { try { return readFileSync(join(dir, f), "utf8"); } catch { return ""; } };
  const files = (() => { try { return readdirSync(dir, { withFileTypes: true }).map((e) => ({ name: e.name, dir: e.isDirectory(), size: e.isDirectory() ? 0 : statSync(join(dir, e.name)).size })).sort((a, b) => a.name.localeCompare(b.name)); } catch { return []; } })();
  return { ...base, caption: read("caption.md"), plan: read("plan.md"), files };
}

/** Absolute path of one slide (or the caption) of a carousel, or null when the name is unsafe or the file is missing. */
export function resolveCarouselFile(carouselsDir: string, folder: string, name: string): string | null {
  if (!SAFE.test(folder) || folder === "." || folder === ".." || !(SLIDE.test(name) || name === "caption.md")) return null;
  const file = join(carouselDirOf(carouselsDir, folder), name);
  return existsSync(file) && statSync(file).isFile() ? file : null;
}
