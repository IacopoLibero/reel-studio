import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readBrandQuestions } from "../factory/service.js";
import { readScheduled, reelDirOf, scanReels } from "../reels/scanner.js";
import type { ReelRef } from "./merge.js";

const firstLine = (file: string): string => {
  try { return readFileSync(file, "utf8").split("\n").find((l) => l.trim())?.trim() ?? ""; } catch { return ""; }
};

/** Every reel folder with the first line of its caption, its closing (from the question list) and cover state. */
export function loadReelRefs(brandDir: string, brand: string): ReelRef[] {
  const reelsDir = join(brandDir, "reels");
  const closings = new Map(readBrandQuestions(brandDir, brand).filter((q) => q.folder).map((q) => [`${q.brand}/${q.folder}`, q.closing]));
  return scanReels(reelsDir, brand, readScheduled(join(brandDir, "scheduled.json"))).map((r) => {
    const cap = join(reelDirOf(reelsDir, r.folder), "caption.md");
    return { key: r.key, brand: r.brand, folder: r.folder, n: r.n, name: r.name, closing: closings.get(r.key) ?? null, firstLine: existsSync(cap) ? firstLine(cap) : "", hasCover: r.hasCover };
  });
}
