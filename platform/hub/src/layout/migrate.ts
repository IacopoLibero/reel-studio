import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync, readlinkSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { compareTrees, isInside } from "./fs-tools.js";
import { buildPlan, lockFilter, type PlanItem } from "./plan.js";

export type { PlanItem } from "./plan.js";

export interface MigrateOptions {
  /** The project folder of the old layout (brand/, reels/, src/, ... next to the program). */
  legacyRoot: string;
  /** The old hub state folder (platform/data). */
  legacyData: string;
  /** The folder holding the old Instagram browser profiles (the Docker volume path), or null. */
  chromeRoot?: string | null;
  /** New: the Remotion workspace with the user's files. */
  workspace: string;
  /** New: the hub state folder. */
  data: string;
  /** Without this, nothing is written: the result is the plan. */
  apply: boolean;
  /** Copy a login folder even if a browser lock file is present (a crash can leave one behind). */
  ignoreBrowserLock?: boolean;
  now?: Date;
  log?: (message: string) => void;
  /** Test seam: called after each item is copied, before it is verified. */
  afterCopy?: (item: PlanItem) => void;
}

export interface MigrateResult {
  status: "planned" | "applied" | "already" | "blocked";
  items: PlanItem[];
  problems: string[];
  warnings: string[];
  verified?: boolean;
}

export const MARKER = "MIGRATED-FROM-LEGACY.json";
export const FAILED_MARKER = "MIGRATION-FAILED.json";
const BUSY = new Set(["queued", "running"]);

const isEmptyDir = (dir: string): boolean => !existsSync(dir) || readdirSync(dir).length === 0;
const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function busyJobs(legacyData: string): { busy: string[]; unreadable: boolean } {
  const file = join(legacyData, "jobs.json");
  if (!existsSync(file)) return { busy: [], unreadable: false };
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    const list = Array.isArray(raw) ? raw : [];
    return { busy: list.filter((j) => j && BUSY.has(String((j as { status?: unknown }).status))).map((j) => String((j as { type?: unknown }).type ?? "job")), unreadable: false };
  } catch { return { busy: [], unreadable: true }; }
}

function blockers(o: MigrateOptions): string[] {
  const problems: string[] = [];
  const jobs = busyJobs(o.legacyData);
  if (jobs.busy.length) problems.push(`A job is queued or running (${jobs.busy.join(", ")}): wait until it finishes, then run the migration again.`);
  if (jobs.unreadable) problems.push(`${join(o.legacyData, "jobs.json")} cannot be read, so running jobs cannot be ruled out: fix or move it, then run again.`);
  if (isInside(o.legacyRoot, o.workspace) || isInside(o.workspace, o.legacyRoot)) problems.push("The workspace and the old project folder are nested in each other: choose a --home outside the project.");
  if (isInside(o.legacyData, o.data) || isInside(o.data, o.legacyData)) problems.push("The new data folder and the old data folder are nested in each other: choose a --home outside the project.");
  if (!isEmptyDir(o.workspace)) problems.push(`The workspace ${o.workspace} is not empty: the migration never writes over existing files.`);
  if (!isEmptyDir(o.data)) problems.push(`The data folder ${o.data} is not empty: the migration never writes over existing files.`);
  return problems;
}

function copyItem(it: PlanItem): void {
  mkdirSync(dirname(it.to), { recursive: true });
  if (it.kind === "link") { symlinkSync(it.target as string, it.to); return; }
  cpSync(it.from, it.to, {
    recursive: true, preserveTimestamps: true, errorOnExist: true, force: false,
    filter: it.skipLocks ? (src) => lockFilter(src, basename(src)) : undefined,
  });
}

/** What differs between a copied item and its original (read again now, not the numbers from planning). */
function verify(it: PlanItem): string | null {
  if (it.kind === "link") return safeLink(it.to) === it.target ? null : `Link ${it.to} was not created.`;
  const diff = compareTrees(it.from, it.to, it.skipLocks ? lockFilter : undefined);
  return diff.length === 0 ? null : `Copy of ${it.to} does not match the original (${diff.length} differences, first: ${diff[0]}).`;
}

const safeLink = (p: string): string | null => { try { return readlinkSync(p); } catch { return null; } };

/** The brand's own profile folder is cleared once its login lives inside the brand's data, so the default location applies. */
function clearOwnProfile(workspace: string, slug: string, warnings: string[]): void {
  const file = join(workspace, "brand", slug, "brand.json");
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { instagram?: Record<string, unknown> };
    writeFileSync(file, JSON.stringify({ ...raw, instagram: { ...(raw.instagram ?? {}), profileDir: null } }, null, 2) + "\n");
  } catch (e) { warnings.push(`Could not clear the profile folder in ${file} (${messageOf(e)}): set instagram.profileDir to null by hand.`); }
}

const slugOfProfile = (it: PlanItem): string => basename(dirname(it.to));

interface CopyRun { failures: string[]; lines: string[] }

function copyAll(o: MigrateOptions, items: readonly PlanItem[], own: Record<string, boolean>, warnings: string[]): CopyRun {
  const run: CopyRun = { failures: [], lines: [] };
  const say = (m: string): void => { run.lines.push(`${new Date().toISOString()} ${m}`); o.log?.(m); };
  for (const it of items) {
    try {
      copyItem(it);
      o.afterCopy?.(it);
    } catch (e) {
      run.failures.push(`Copy of ${it.from} to ${it.to} failed: ${messageOf(e)}`);
      say(`FAILED ${it.from} -> ${it.to}: ${messageOf(e)}`);
      break;
    }
    const bad = verify(it);
    if (bad) run.failures.push(bad);
    say(`${bad ? "MISMATCH" : "copied"} ${it.from} -> ${it.to} (${it.files} files, ${it.bytes} bytes)`);
    if (!bad && it.kind === "profile" && own[slugOfProfile(it)]) clearOwnProfile(o.workspace, slugOfProfile(it), warnings);
  }
  for (const w of warnings) say(`warning: ${w}`);
  return run;
}

/**
 * Copies the user's files from the old layout (everything in one project folder, the login in a Docker volume) into the new one
 * (a workspace, a data folder, the login inside each brand's data). It only copies: the originals stay where they are.
 */
export function migrateLayout(o: MigrateOptions): MigrateResult {
  const now = o.now ?? new Date();
  if (existsSync(join(o.data, MARKER))) return { status: "already", items: [], problems: [], warnings: [] };
  if (existsSync(join(o.data, FAILED_MARKER))) {
    return { status: "blocked", items: [], warnings: [], problems: [`A previous migration copied files but could not verify them (${join(o.data, FAILED_MARKER)}). Empty ${o.workspace} and ${o.data}, then run again.`] };
  }
  const plan = buildPlan({ legacyRoot: o.legacyRoot, legacyData: o.legacyData, chromeRoot: o.chromeRoot ?? null, workspace: o.workspace, data: o.data, ignoreBrowserLock: o.ignoreBrowserLock });
  const problems = [...blockers(o), ...plan.problems];
  if (problems.length) return { status: "blocked", items: plan.items, problems, warnings: plan.warnings };
  if (!o.apply) return { status: "planned", items: plan.items, problems: [], warnings: plan.warnings };

  mkdirSync(o.workspace, { recursive: true });
  mkdirSync(o.data, { recursive: true });
  const warnings = [...plan.warnings];
  const run = copyAll(o, plan.items, plan.ownProfile, warnings);
  const verified = run.failures.length === 0;
  mkdirSync(join(o.workspace, ".reel-studio"), { recursive: true });
  appendFileSync(join(o.workspace, ".reel-studio", "migration.log"), run.lines.join("\n") + "\n");
  const note = { at: now.toISOString(), legacyRoot: o.legacyRoot, legacyData: o.legacyData, items: plan.items.length, verified, problems: run.failures };
  writeFileSync(join(o.data, verified ? MARKER : FAILED_MARKER), JSON.stringify(note, null, 2) + "\n");
  return { status: "applied", items: plan.items, problems: run.failures, warnings, verified };
}
