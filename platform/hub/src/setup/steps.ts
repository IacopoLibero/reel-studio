import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { runPrepare } from "../layout/prepare.js";
import { toolsDir } from "./checks.js";
import type { StepFn } from "./installer.js";
import { runCommand, sha256File } from "./run.js";

/** The Blender the app downloads: the official tarball, pinned and checked (the same build the Docker image used). */
export const BLENDER = {
  version: "5.3.0",
  url: "https://download.blender.org/release/Blender5.3/blender-5.3.0-linux-x64.tar.xz",
  sha256: "dacb8264197a3f7fda6001285a5a506fc97ee943881261c2c3bd63c882f22e05",
} as const;

export interface StepContext { workspace: string; dataDir: string; programRoot: string }

async function download(url: string, to: string, log: (l: string) => void): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) for ${url}`);
  const total = Number(res.headers.get("content-length") ?? 0);
  let got = 0, shown = -1;
  const body = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
  body.on("data", (c: Buffer) => {
    got += c.length;
    const pct = total ? Math.floor((got / total) * 100 / 5) * 5 : -1;
    if (pct !== shown && pct >= 0) { shown = pct; log(`downloaded ${pct}% (${Math.round(got / 1e6)} of ${Math.round(total / 1e6)} MB)`); }
  });
  await pipeline(body, createWriteStream(to));
}

/**
 * An empty folder left by an earlier Docker setup (it was the mount point of a volume, so it belongs to root and npm cannot write in it).
 * An empty folder holds nothing, so it is removed and npm makes a new one. Returns true when it was removed.
 */
export function clearEmptyMountPoint(dir: string): boolean {
  try {
    if (readdirSync(dir).length > 0) return false;
    rmdirSync(dir);
    return true;
  } catch { return false; }
}

/** Puts the program's files in the workspace and installs its Node packages (Remotion). */
export const workspacePackages = (c: StepContext): StepFn => async (log) => {
  mkdirSync(c.workspace, { recursive: true });
  const code = runPrepare({ write: (t) => t.split("\n").filter(Boolean).forEach(log) }, { REEL_ROOT: c.workspace, PROGRAM_ROOT: c.programRoot });
  if (code !== 0) throw new Error("Could not fill the workspace with the program's files.");
  if (clearEmptyMountPoint(join(c.workspace, "node_modules"))) log("removed an empty node_modules folder left by the old Docker setup");
  log("installing the workspace packages (about 600 MB, a few minutes)");
  await runCommand("npm", ["ci"], { cwd: c.workspace }, log).catch(() => runCommand("npm", ["install"], { cwd: c.workspace }, log));
};

/** Downloads Blender into `<data>/tools/blender/`, checks its checksum and unpacks it. */
export const blender = (c: StepContext): StepFn => async (log) => {
  const dir = toolsDir(c.dataDir, "blender");
  if (existsSync(join(dir, "blender"))) { log("Blender is already installed"); return; }
  mkdirSync(dir, { recursive: true });
  const archive = join(dir, ".download.tar.xz");
  log(`downloading Blender ${BLENDER.version}`);
  await download(BLENDER.url, archive, log);
  log("checking the download");
  if ((await sha256File(archive)) !== BLENDER.sha256) { rmSync(archive, { force: true }); throw new Error("The Blender download is damaged (checksum does not match). Try again."); }
  const staging = join(dir, ".unpack");
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  log("unpacking");
  await runCommand("tar", ["-xJf", archive, "-C", staging, "--strip-components=1"], { cwd: dir }, log);
  for (const name of readdirSync(staging)) renameSync(join(staging, name), join(dir, name));
  rmSync(staging, { recursive: true, force: true });
  rmSync(archive, { force: true });
  log("Blender is ready");
};
