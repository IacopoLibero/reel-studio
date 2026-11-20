import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, statSync } from "node:fs";
import { join } from "node:path";
import { isProgramPath } from "./manifest.js";
import { findSymlinks, measure, type PathFilter } from "./fs-tools.js";

export interface PlanItem {
  kind: "workspace" | "data" | "profile" | "link";
  from: string;
  to: string;
  files: number;
  bytes: number;
  /** Browser lock files are left out of a profile copy. */
  skipLocks?: boolean;
  /** For a link: where it points (copied as written, so it stays relative). */
  target?: string;
}

export interface Plan { items: PlanItem[]; warnings: string[]; problems: string[]; ownProfile: Record<string, boolean> }

export interface PlanInput {
  legacyRoot: string;
  legacyData: string;
  chromeRoot: string | null;
  workspace: string;
  data: string;
  ignoreBrowserLock?: boolean;
}

/** Whole folders and single files of the author's that move into the workspace unchanged. */
const WORKSPACE_FOLDERS = ["reels", "mascot", "characters", "public", ".agents"] as const;
const WORKSPACE_FILES = ["skills-lock.json", ".claude/settings.local.json"] as const;
/** Third-party skills installed into the project as real folders (an Ootto skill that is a link is handled as a link below). */
const INSTALLED_SKILL = /^(remotion|ootto)-/;
/** The Ootto skills are switched on by a link to the library the program ships; which links exist is the user's choice. */
const OOTTO_LINK = /^ootto-[a-z0-9-]+$/;
const DATA_SKIPPED = new Set(["tmp-uploads"]);

export const lockFilter: PathFilter = (_p, name) => !name.startsWith("Singleton");

const isDir = (p: string): boolean => { try { return statSync(p).isDirectory(); } catch { return false; } };
const names = (path: string): string[] => (existsSync(path) ? readdirSync(path).sort() : []);
const realDirs = (path: string): string[] => names(path).filter((n) => { try { return lstatSync(join(path, n)).isDirectory(); } catch { return false; } });

function item(kind: PlanItem["kind"], from: string, to: string, skipLocks = false): PlanItem {
  const m = measure(from, skipLocks ? lockFilter : undefined);
  return { kind, from, to, files: m.files, bytes: m.bytes, ...(skipLocks ? { skipLocks } : {}) };
}

function workspaceItems(i: PlanInput): PlanItem[] {
  const out: PlanItem[] = [];
  for (const top of ["brand", "src"]) {
    for (const name of names(join(i.legacyRoot, top))) {
      if (!isProgramPath(`${top}/${name}`)) out.push(item("workspace", join(i.legacyRoot, top, name), join(i.workspace, top, name)));
    }
  }
  for (const rel of WORKSPACE_FOLDERS) if (existsSync(join(i.legacyRoot, rel))) out.push(item("workspace", join(i.legacyRoot, rel), join(i.workspace, rel)));
  for (const rel of WORKSPACE_FILES) if (existsSync(join(i.legacyRoot, rel))) out.push(item("workspace", join(i.legacyRoot, rel), join(i.workspace, rel)));
  for (const name of realDirs(join(i.legacyRoot, ".claude/skills"))) {
    if (INSTALLED_SKILL.test(name)) out.push(item("workspace", join(i.legacyRoot, ".claude/skills", name), join(i.workspace, ".claude/skills", name)));
  }
  return out;
}

function linkItems(i: PlanInput): PlanItem[] {
  const dir = join(i.legacyRoot, ".claude/skills");
  return names(dir).filter((n) => OOTTO_LINK.test(n) && lstatSync(join(dir, n)).isSymbolicLink())
    .map((n) => ({ kind: "link" as const, from: join(dir, n), to: join(i.workspace, ".claude/skills", n), files: 0, bytes: 0, target: readlinkSync(join(dir, n)) }));
}

function dataItems(i: PlanInput): PlanItem[] {
  return names(i.legacyData).filter((n) => !DATA_SKIPPED.has(n)).map((n) => item("data", join(i.legacyData, n), join(i.data, n)));
}

function ownProfileDir(brandJson: string): string | null {
  try {
    const raw = JSON.parse(readFileSync(brandJson, "utf8")) as { instagram?: { profileDir?: unknown } };
    const p = raw.instagram?.profileDir;
    return typeof p === "string" && p.trim() ? p : null;
  } catch { return null; }
}

const looksLikeProfile = (dir: string): boolean => existsSync(join(dir, "Default")) || existsSync(join(dir, "Local State"));

/** Where a brand's login can be, most specific first: its own folder, <chromeRoot>/<slug>, then chromeRoot itself when that is a profile. */
function profileCandidates(mine: string | null, chromeRoot: string | null, slug: string): string[] {
  const out: string[] = [];
  if (mine) out.push(mine);
  if (chromeRoot) { out.push(join(chromeRoot, slug)); if (looksLikeProfile(chromeRoot)) out.push(chromeRoot); }
  return out;
}

interface Profiles { items: PlanItem[]; warnings: string[]; problems: string[]; own: Record<string, boolean> }

function profileItems(i: PlanInput): Profiles {
  const res: Profiles = { items: [], warnings: [], problems: [], own: {} };
  for (const slug of realDirs(join(i.legacyRoot, "brand")).filter((s) => !s.startsWith("_") && existsSync(join(i.legacyRoot, "brand", s, "brand.json")))) {
    const mine = ownProfileDir(join(i.legacyRoot, "brand", slug, "brand.json"));
    const tried = profileCandidates(mine, i.chromeRoot, slug);
    const from = tried.find(isDir);
    if (!from) {
      res.warnings.push(`Brand "${slug}": no Instagram login folder found (looked at ${tried.join(", ") || "nowhere"}); log in to Instagram again after the migration.`);
      continue;
    }
    res.items.push(item("profile", from, join(i.data, "brands", slug, "profile"), true));
    res.own[slug] = mine !== null;
    if (!i.ignoreBrowserLock && existsSync(join(from, "SingletonLock"))) {
      res.problems.push(`The Instagram login of "${slug}" looks in use (${join(from, "SingletonLock")}): stop the hub (the container) and run again. If a crash left the lock behind, add --ignore-browser-lock.`);
    }
  }
  return res;
}

/** Symbolic links inside the folders that are copied: they would point back into the old tree, so the user must replace them first. */
function symlinkProblems(items: readonly PlanItem[]): string[] {
  return items.filter((it) => it.kind !== "link").flatMap((it) => findSymlinks(it.from, it.skipLocks ? lockFilter : undefined))
    .map((l) => `Symbolic link ${l}: the copy would still point into the old folder. Replace it with the real files and run again.`);
}

/** What the migration would copy, with counts, without writing anything. */
export function buildPlan(i: PlanInput): Plan {
  const profiles = profileItems(i);
  const items = [...workspaceItems(i), ...linkItems(i), ...dataItems(i), ...profiles.items];
  return { items, warnings: profiles.warnings, problems: [...profiles.problems, ...symlinkProblems(items)], ownProfile: profiles.own };
}
