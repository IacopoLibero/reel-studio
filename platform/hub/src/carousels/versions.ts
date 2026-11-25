import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export const CAROUSEL_VERSIONS_DIR = "versions";
const KEEP = 10;
const KEPT_FILES = /^(slide-\d+\.png|alt\.json|caption\.md)$/;

/** Copies the slides, the alt texts and the caption into versions/<stamp>/ before a change, and keeps the newest ten. Returns the stamp. */
export function snapshotCarousel(dir: string, now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const to = join(dir, CAROUSEL_VERSIONS_DIR, stamp);
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(dir)) if (KEPT_FILES.test(f)) cpSync(join(dir, f), join(to, f));
  const all = readdirSync(join(dir, CAROUSEL_VERSIONS_DIR)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP))) rmSync(join(dir, CAROUSEL_VERSIONS_DIR, old), { recursive: true, force: true });
  return stamp;
}

/** Puts back one file from a snapshot. */
export function restoreFromSnapshot(dir: string, stamp: string, name: string): boolean {
  const from = join(dir, CAROUSEL_VERSIONS_DIR, stamp, name);
  if (!existsSync(from)) return false;
  cpSync(from, join(dir, name));
  return true;
}
