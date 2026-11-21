import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { PROGRAM_ENTRIES } from "./manifest.js";
import { blockedByLinkOrFolder, listFiles, pruneEmptyDirs, safeJoin, sha256 } from "./fs-tools.js";

export interface SyncOptions {
  /** The program folder (where the shipped files are). */
  programRoot: string;
  /** The user's workspace (the Remotion project the program fills in). */
  workspace: string;
  entries?: readonly string[];
  version?: string;
  dryRun?: boolean;
  now?: Date;
}

export interface SyncReport {
  copied: string[];
  unchanged: string[];
  removed: string[];
  /** Files the user had changed or that existed before (a copy was saved in .reel-studio/overwritten/ before they were replaced), and files left alone because a link or a folder is in the way. */
  preserved: string[];
  /** Manifest entries the program does not have. */
  missing: string[];
  /** Switched-on Ootto skills (`.claude/skills/ootto-<name>`) whose link was pointed at the program's skills folder. */
  relinked: string[];
  dryRun: boolean;
}

interface SyncState { version: string; at: string; files: Readonly<Record<string, string>>; programRoot?: string }

const STATE_DIR = ".reel-studio";
const posix = (p: string): string => p.split(sep).join("/");

function readState(file: string): SyncState {
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<SyncState>;
    return { version: String(raw.version ?? ""), at: String(raw.at ?? ""), files: raw.files && typeof raw.files === "object" ? raw.files : {} };
  } catch { return { version: "", at: "", files: {} }; }
}

function writeState(file: string, state: SyncState): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
  renameSync(tmp, file);
}

/** The shipped files: relative path (posix) to absolute source, and the entries that do not exist. */
function collect(programRoot: string, entries: readonly string[]): { wanted: Map<string, string>; missing: string[] } {
  const wanted = new Map<string, string>();
  const missing: string[] = [];
  for (const e of entries) {
    const found = listFiles(safeJoin(programRoot, e));
    if (found.length === 0) missing.push(e);
    for (const f of found) wanted.set(posix(relative(programRoot, f)), f);
  }
  return { wanted, missing };
}

const stampOf = (d: Date): string => d.toISOString().replace(/:/g, "-");

function saveCopy(workspace: string, stamp: string, rel: string, from: string): void {
  const to = join(workspace, STATE_DIR, "overwritten", stamp, rel);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

/**
 * Fills the workspace with the program's own files (the Remotion kit, scripts, base skills, brand template) and removes the ones the program
 * no longer ships. Only files listed in the manifest are ever written or removed; a file the user changed is saved aside first.
 */
export function syncProgram(o: SyncOptions): SyncReport {
  const dryRun = o.dryRun ?? false;
  const now = o.now ?? new Date();
  const stamp = stampOf(now);
  const stateFile = join(o.workspace, STATE_DIR, "program.json");
  const prev = readState(stateFile);
  const { wanted, missing } = collect(o.programRoot, o.entries ?? PROGRAM_ENTRIES);
  const report: SyncReport = { copied: [], unchanged: [], removed: [], preserved: [], missing, relinked: [], dryRun };
  const next: Record<string, string> = {};

  for (const rel of [...wanted.keys()].sort()) {
    const src = wanted.get(rel) as string;
    const dest = safeJoin(o.workspace, rel);
    if (blockedByLinkOrFolder(o.workspace, dest)) { report.preserved.push(rel); continue; }
    const hash = sha256(src);
    next[rel] = hash;
    if (existsSync(dest)) {
      const current = sha256(dest);
      if (current === hash) { report.unchanged.push(rel); continue; }
      if (prev.files[rel] !== current) {
        report.preserved.push(rel);
        if (!dryRun) saveCopy(o.workspace, stamp, rel, dest);
      }
    }
    report.copied.push(rel);
    if (dryRun) continue;
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    chmodSync(dest, statSync(src).mode & 0o777);
  }

  for (const rel of Object.keys(prev.files).sort()) {
    if (rel in next) continue;
    const dest = safeJoin(o.workspace, rel);
    if (!existsSync(dest)) continue;
    if (blockedByLinkOrFolder(o.workspace, dest) || sha256(dest) !== prev.files[rel]) { report.preserved.push(rel); continue; }
    report.removed.push(rel);
    if (dryRun) continue;
    rmSync(dest);
    pruneEmptyDirs(dirname(dest), o.workspace);
  }

  if (!dryRun) {
    report.relinked = repointSkillLinks(o.workspace, o.programRoot);
    writeState(stateFile, { version: o.version ?? "", at: now.toISOString(), files: next, programRoot: o.programRoot });
  }
  return report;
}

/**
 * The Ootto skills a person switched on are links in `.claude/skills/ootto-<name>`. They point at the program's `platform/skills/ootto/<name>`
 * (absolute from a workspace, relative inside the program itself), so they are read where the program keeps them. Links of an older
 * layout (into a copy inside the workspace) or of another place of the program are pointed again; a link whose skill the program no longer has is left alone.
 */
export function repointSkillLinks(workspace: string, programRoot: string): string[] {
  const dir = join(workspace, ".claude", "skills");
  const changed: string[] = [];
  let names: string[] = [];
  try { names = readdirSync(dir); } catch { return changed; }
  for (const entry of names.filter((n) => /^ootto-[a-z0-9-]+$/.test(n))) {
    const link = join(dir, entry);
    try { if (!lstatSync(link).isSymbolicLink()) continue; } catch { continue; }
    const wanted = join(programRoot, "platform", "skills", "ootto", entry.slice("ootto-".length));
    if (!existsSync(join(wanted, "SKILL.md"))) continue;
    const inside = resolve(programRoot) === resolve(workspace);
    const target = inside ? relative(dir, wanted) : wanted;
    if (readlinkSync(link) === target) continue;
    const tmp = `${link}.tmp`;
    rmSync(tmp, { force: true });
    symlinkSync(target, tmp);
    renameSync(tmp, link);
    changed.push(entry);
  }
  return changed;
}
