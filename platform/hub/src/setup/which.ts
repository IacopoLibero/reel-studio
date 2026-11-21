import { accessSync, constants, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";

/** The full path of an executable found in `pathVar` (default: the PATH), or null. */
export function findOnPath(name: string, pathVar: string = process.env.PATH ?? ""): string | null {
  for (const dir of pathVar.split(delimiter).filter(Boolean)) {
    const f = join(dir, name);
    try { if (statSync(f).isFile()) { accessSync(f, constants.X_OK); return f; } } catch { /* not here */ }
  }
  return null;
}

/** The name of the first NVIDIA graphics card, or null when there is none or the driver tools are missing. */
export function detectGpu(): string | null {
  const r = spawnSync("nvidia-smi", ["--query-gpu=name", "--format=csv,noheader"], { encoding: "utf8", timeout: 5000 });
  return r.status === 0 ? (r.stdout.split("\n")[0]?.trim() || null) : null;
}
