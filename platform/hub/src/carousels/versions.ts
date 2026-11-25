import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const CAROUSEL_VERSIONS_DIR = "versions";
const KEEP = 20;
const KEPT_FILES = /^(slide-\d+\.png|alt\.json|caption\.md)$/;
const STAMP = /^[0-9A-Za-z._-]+$/;

export interface CarouselVersion {
  /** The folder name inside versions/, also the id in the routes. */
  id: string;
  at: string;
  /** Why it was kept: what the person asked for, or where it came from. */
  label: string;
  slides: string[];
  hasAlt: boolean;
  hasCaption: boolean;
}

const slideNames = (files: string[]): string[] => {
  const nums = new Set(files.map((f) => /^slide-(\d+)\.png$/.exec(f)?.[1]).filter((x): x is string => !!x).map(Number));
  return [...nums].sort((a, b) => a - b).map((n) => `slide-${n}.png`);
};

/** Copies the slides, the alt texts and the caption into versions/<stamp>/ before a change, and keeps the newest twenty. Returns the stamp. */
export function snapshotCarousel(dir: string, now: Date = new Date(), label = ""): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const to = join(dir, CAROUSEL_VERSIONS_DIR, stamp);
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(dir)) if (KEPT_FILES.test(f)) cpSync(join(dir, f), join(to, f));
  writeFileSync(join(to, "meta.json"), JSON.stringify({ at: now.toISOString(), label: label.slice(0, 300) }));
  const all = readdirSync(join(dir, CAROUSEL_VERSIONS_DIR)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP))) rmSync(join(dir, CAROUSEL_VERSIONS_DIR, old), { recursive: true, force: true });
  return stamp;
}

/** The kept versions, newest first. */
export function listVersions(dir: string): CarouselVersion[] {
  const root = join(dir, CAROUSEL_VERSIONS_DIR);
  let ids: string[] = [];
  try { ids = readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; }
  return ids.sort().reverse().map((id) => {
    const files = readdirSync(join(root, id));
    let meta: { at?: string; label?: string } = {};
    try { meta = JSON.parse(readFileSync(join(root, id, "meta.json"), "utf8")); } catch { /* an older snapshot has no meta.json */ }
    return { id, at: meta.at ?? statSync(join(root, id)).mtime.toISOString(), label: meta.label ?? "", slides: slideNames(files), hasAlt: files.includes("alt.json"), hasCaption: files.includes("caption.md") };
  }).filter((v) => v.slides.length > 0);
}

/** Absolute path of one file of a kept version, or null when the id or the name is unsafe or the file is missing. */
export function versionFile(dir: string, id: string, name: string): string | null {
  if (!STAMP.test(id) || id === "." || id === ".." || !(KEPT_FILES.test(name))) return null;
  const file = join(dir, CAROUSEL_VERSIONS_DIR, id, name);
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

/** Puts back one file from a snapshot. */
export function restoreFromSnapshot(dir: string, stamp: string, name: string): boolean {
  const from = versionFile(dir, stamp, name);
  if (!from) return false;
  cpSync(from, join(dir, name));
  return true;
}

/**
 * Makes a kept version the current one: the current slides, alt texts and caption are kept first (so nothing is lost),
 * then the version's files are copied over, and a slide the version does not have is removed from the folder.
 * The source (scene, code) is not part of a version: only what is shown and posted is.
 */
export function restoreVersion(dir: string, id: string, now: Date = new Date()): { kept: string; slides: number } | null {
  const v = listVersions(dir).find((x) => x.id === id);
  if (!v) return null;
  const kept = snapshotCarousel(dir, now, `Before going back to ${v.label || v.id}`);
  for (const f of readdirSync(dir)) if (/^slide-\d+\.png$/.test(f) && !v.slides.includes(f)) rmSync(join(dir, f));
  for (const f of [...v.slides, ...(v.hasAlt ? ["alt.json"] : []), ...(v.hasCaption ? ["caption.md"] : [])]) restoreFromSnapshot(dir, id, f);
  return { kept, slides: v.slides.length };
}
