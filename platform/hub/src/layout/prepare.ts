import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { defaultProgramRoot } from "../paths.js";
import { syncProgram } from "./sync.js";

export interface Out { write(text: string): void }

function versionOf(root: string): string {
  try { return String((JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version?: unknown }).version ?? ""); } catch { return ""; }
}

/**
 * Run at every start of the hub in the new layout: puts the program's own files (Remotion kit, scripts, base skills, brand template)
 * into the workspace. Returns the exit code: 0 done (or nothing to do), 2 when REEL_ROOT is not set.
 */
export function runPrepare(out: Out, env: NodeJS.ProcessEnv = process.env, now: Date = new Date()): number {
  const work = env.REEL_ROOT?.trim();
  if (!work) { out.write("prepare-workspace: REEL_ROOT is not set.\n"); return 2; }
  const programRoot = resolve(env.PROGRAM_ROOT?.trim() || defaultProgramRoot());
  const workspace = resolve(work);
  if (workspace === programRoot) { out.write("prepare-workspace: the workspace and the program are the same folder, nothing to copy.\n"); return 0; }
  const r = syncProgram({ programRoot, workspace, version: versionOf(programRoot), now });
  out.write(`prepare-workspace: ${r.copied.length} copied, ${r.unchanged.length} unchanged, ${r.removed.length} removed.\n`);
  if (r.preserved.length) out.write(`prepare-workspace: your own versions were saved aside or left alone (see .reel-studio/overwritten): ${r.preserved.join(", ")}.\n`);
  if (r.missing.length) out.write(`prepare-workspace: not in the program: ${r.missing.join(", ")}.\n`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(runPrepare(process.stdout));
