import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { chromeProfileRoot } from "../brands/paths.js";
import { defaultProgramRoot, studioHome } from "../paths.js";
import { migrateLayout, type MigrateResult } from "./migrate.js";
import { syncProgram, type SyncReport } from "./sync.js";

export interface Out { write(text: string): void }

const USAGE = `Usage: migrate-layout [--apply] [--ignore-browser-lock] [--home <folder>] [--legacy-root <folder>] [--legacy-data <folder>] [--chrome-root <folder>]

Copies your brands, reels, reel code, character files, hub data and Instagram logins from the old single-folder layout into
  <home>/workspace  (brand/, reels/, mascot/, public/, src/ ...) and
  <home>/data       (hub settings, jobs, and each brand's data with its Instagram login in brands/<slug>/profile),
then fills the workspace with the program's own files. Nothing is moved or deleted: the originals stay where they are.
Without --apply it only shows what it would do. Stop the hub (the container) first: a running browser or job would make the copy unreliable.`;

interface Args { apply: boolean; ignoreBrowserLock: boolean; home?: string; legacyRoot?: string; legacyData?: string; chromeRoot?: string }

function parse(argv: readonly string[]): Args | null {
  const a: Args = { apply: false, ignoreBrowserLock: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--apply") a.apply = true;
    else if (k === "--ignore-browser-lock") a.ignoreBrowserLock = true;
    else if (k === "--home" && v) { a.home = v; i++; }
    else if (k === "--legacy-root" && v) { a.legacyRoot = v; i++; }
    else if (k === "--legacy-data" && v) { a.legacyData = v; i++; }
    else if (k === "--chrome-root" && v) { a.chromeRoot = v; i++; }
    else return null;
  }
  return a;
}

const mb = (n: number): string => `${(n / 1_048_576).toFixed(1)} MB`;

function programVersion(root: string): string {
  try { return String((JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version?: unknown }).version ?? ""); } catch { return ""; }
}

function describePlan(r: MigrateResult, base: string): string {
  const rows = r.items.map((i) => `  ${i.kind.padEnd(9)} ${relative(base, i.to).padEnd(48)} ${String(i.files).padStart(6)} files ${mb(i.bytes).padStart(10)}`);
  const total = r.items.reduce((n, i) => ({ files: n.files + i.files, bytes: n.bytes + i.bytes }), { files: 0, bytes: 0 });
  return [...rows, `  ${"total".padEnd(58)} ${String(total.files).padStart(6)} files ${mb(total.bytes).padStart(10)}`].join("\n") + "\n";
}

function describeSync(s: SyncReport): string {
  const parts = [`${s.copied.length} to copy`, `${s.unchanged.length} unchanged`, `${s.removed.length} to remove`];
  if (s.missing.length) parts.push(`missing in the program: ${s.missing.join(", ")}`);
  const kept = s.preserved.length ? `Your own versions of these were saved aside or left alone (see .reel-studio/overwritten): ${s.preserved.join(", ")}.\n` : "";
  return `Program files in the workspace: ${parts.join(", ")}.\n${kept}`;
}

/** The migration from the old layout. Returns the exit code: 0 done or planned, 1 stopped (job running, folder not empty, copy mismatch), 2 bad usage. */
export function runLayoutCli(argv: readonly string[], out: Out, now: Date = new Date(), env: NodeJS.ProcessEnv = process.env): number {
  const args = parse(argv);
  if (!args) { out.write(USAGE + "\n"); return 2; }
  const programRoot = resolve(args.legacyRoot ?? defaultProgramRoot());
  const legacyData = resolve(args.legacyData ?? env.HUB_DATA?.trim() ?? join(programRoot, "platform/data"));
  const home = args.home ? resolve(args.home) : studioHome(env);
  const workspace = join(home, "workspace");
  const data = join(home, "data");
  const result = migrateLayout({ legacyRoot: programRoot, legacyData, chromeRoot: resolve(args.chromeRoot ?? chromeProfileRoot(env)), workspace, data, apply: args.apply, ignoreBrowserLock: args.ignoreBrowserLock, now, log: () => undefined });

  if (result.status === "already") { out.write(`Already migrated (${join(data, "MIGRATED-FROM-LEGACY.json")}). Nothing to do.\n`); return 0; }
  out.write(`${args.apply ? "Migration" : "Dry run"}: ${programRoot}  ->  ${home}\n\n${describePlan(result, home)}\n`);
  for (const w of result.warnings) out.write(`Warning: ${w}\n`);
  if (result.status === "blocked") { for (const p of result.problems) out.write(`Stopped: ${p}\n`); return 1; }
  if (result.status === "planned") {
    out.write("\n" + describeSync(syncProgram({ programRoot, workspace, version: programVersion(programRoot), dryRun: true, now })));
    out.write("\nNothing was written. Run again with --apply to do it (stop the hub's jobs first, and keep a backup).\n");
    return 0;
  }
  out.write("\n" + describeSync(syncProgram({ programRoot, workspace, version: programVersion(programRoot), now })));
  if (!result.verified) { for (const p of result.problems) out.write(`Check failed: ${p}\n`); return 1; }
  out.write(`\nDone and verified. The originals were not touched: delete them yourself once the hub works from ${home}.\nLog: ${join(workspace, ".reel-studio", "migration.log")}\n`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(runLayoutCli(process.argv.slice(2), process.stdout));
