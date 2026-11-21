import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { toolsDir } from "./checks.js";

/** `<data>/tools/bin`: small wrappers (blender, blender-run) so skills and jobs find the app's own Blender through the PATH. */
export const toolBinDir = (dataDir: string): string => join(dataDir, "tools", "bin");

export const withToolPath = (dataDir: string, pathVar: string = process.env.PATH ?? ""): string => [toolBinDir(dataDir), pathVar].filter(Boolean).join(delimiter);

const q = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * Writes the wrappers for the Blender in `<data>/tools/blender/`, when it is installed. Run at every start and after the install,
 * so they always point at the current data folder. BLENDER_DEVICE (cpu | gpu | auto) picks software or hardware GL for renders.
 */
export function ensureToolBin(dataDir: string): void {
  const blender = join(toolsDir(dataDir, "blender"), "blender");
  if (!existsSync(blender)) return;
  const bin = toolBinDir(dataDir);
  mkdirSync(bin, { recursive: true });
  const plain = `#!/bin/sh\nexec ${q(blender)} "$@"\n`;
  const run = `#!/bin/sh
# Blender for headless renders. BLENDER_DEVICE = cpu | gpu | auto (default cpu).
dev="\${BLENDER_DEVICE:-cpu}"
if [ "$dev" = auto ]; then nvidia-smi -L >/dev/null 2>&1 && dev=gpu || dev=cpu; fi
case "$dev" in
  cpu) export LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe ;;
  gpu) unset LIBGL_ALWAYS_SOFTWARE GALLIUM_DRIVER ;;
  *) echo "blender-run: BLENDER_DEVICE must be cpu|gpu|auto" >&2; exit 2 ;;
esac
exec ${q(blender)} "$@"
`;
  for (const [name, text] of [["blender", plain], ["blender-run", run]] as const) {
    const f = join(bin, name);
    writeFileSync(f, text);
    chmodSync(f, 0o755);
  }
}
