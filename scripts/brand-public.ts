import { copyFileSync, existsSync, linkSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Where a render finds its files. Remotion reads sounds, images and audio with staticFile() from one "public" folder.
 * A brand keeps its own files in its own folder (<data>/brands/<slug>/identity, mascot, reels), so for every run of Remotion this module
 * builds a small public folder for the brand it is for, out of hard links (no copy of the 500 MB of character frames):
 *
 *   logo.png            <brand>/identity/logo.png            (missing when the brand has no logo)
 *   mascot/<move>/...   <brand>/mascot/movements/<move>/...  (the character's rendered moves)
 *   sfx/<sound>.wav     <program>/sfx/                            (the sounds every brand can use; read from the program, not copied into the workspace)
 *   <n>-<name>/<x>.wav  <brand>/reels/<n>-<name>/audio/<x>.wav   (the final audio of each reel, e.g. narrator.wav)
 *
 * Used by remotion.config.ts, so `npx remotion render|still|studio` needs no extra step. Plain Node: no dependency.
 */

const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** The final audio of a reel: narrator.wav, narrator.wav. The pieces (narrator-3.wav, narrator-16k.wav) stay where they are. */
const FINAL_AUDIO = /^[A-Za-z0-9_]+\.wav$/;
const REEL_FOLDER = /^\d+-[A-Za-z0-9._-]+$/;

/** Used when the workspace has no brand at all (a first run, the smoke test): the colours and fonts of the template. */
const DEFAULT_BRAND = {
  version: 1, slug: "template", name: "Brand", language: "en", website: "example.com", about: "", audience: "", tone: "",
  colors: { background: "#f5f5f0", text: "#1a1a1a", accent: "#2f6fed", secondary: "#7a4dff" },
  fonts: { headline: "Oswald", body: "Inter" },
  closing: { A: { label: "Try it", line: "Try it today at example.com." }, B: { label: "Follow for tips", line: "Follow me for more tips." } },
  offer: { lastDay: null, regex: null }, instagram: { account: "", userId: "", profileDir: null }, sources: { blogDir: null },
  character: { enabled: false, id: "character", name: "" }, voice: { engine: "voxcpm2", sample: null, sampleText: null },
};

const dirs = (p: string): string[] => {
  try { return readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; }
};

/** Where the brand folders are: REEL_BRANDS_DIR (the hub sets it to <data>/brands), else the `data/brands` folder next to the workspace. */
export const brandsDirFor = (workspace: string, env: NodeJS.ProcessEnv = process.env): string => env.REEL_BRANDS_DIR?.trim() || join(workspace, "..", "data", "brands");

/** The program folder: REEL_PROGRAM (the hub sets it), else the one the program recorded in .reel-studio/program.json, else the workspace itself. */
export function programRootOf(workspace: string, env: NodeJS.ProcessEnv = process.env): string {
  const named = env.REEL_PROGRAM?.trim();
  if (named) return named;
  try {
    const recorded = (JSON.parse(readFileSync(join(workspace, ".reel-studio", "program.json"), "utf8")) as { programRoot?: unknown }).programRoot;
    if (typeof recorded === "string" && recorded) return recorded;
  } catch { /* no record yet */ }
  return workspace;
}

export const identityJson = (brandsDir: string, slug: string): string => join(brandsDir, slug, "identity", "brand.json");

/**
 * The brand a render is for: REEL_BRAND (the hub sets it for every job), else the first brand folder that has an identity/brand.json. Null when there is none.
 * A REEL_BRAND that names no brand is an error, never a reason to render with another brand's logo, colours and character.
 */
export function pickBrand(brandsDir: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const named = env.REEL_BRAND?.trim();
  if (named) {
    if (!SLUG.test(named) || !existsSync(identityJson(brandsDir, named))) throw new Error(`REEL_BRAND is "${named}", but there is no ${named}/identity/brand.json in ${brandsDir}.`);
    return named;
  }
  return dirs(brandsDir).filter((n) => SLUG.test(n) && existsSync(identityJson(brandsDir, n))).sort()[0] ?? null;
}

/** The brand.json the kit imports as "brand-theme": the brand's own, or the built-in default written to .reel-studio/. */
export function themeFile(workspace: string, brandsDir: string, slug: string | null): string {
  if (slug) return identityJson(brandsDir, slug);
  const file = join(workspace, ".reel-studio", "default-brand.json");
  mkdirSync(join(workspace, ".reel-studio"), { recursive: true });
  writeFileSync(file, `${JSON.stringify(DEFAULT_BRAND, null, 2)}\n`);
  return file;
}

/** Hard-links every file of `src` into `dst` (copies when a link is not possible, e.g. another file system). */
function linkTree(src: string, dst: string, keep: (name: string) => boolean = () => true): void {
  mkdirSync(dst, { recursive: true });
  for (const e of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, e.name), to = join(dst, e.name);
    if (e.isDirectory()) linkTree(from, to, keep);
    else if (e.isFile() && keep(e.name)) linkFile(from, to);
  }
}

function linkFile(from: string, to: string): void {
  try { linkSync(from, to); } catch {
    // Another file system (or one without hard links): a copy works but costs the size of the file for as long as the run lasts.
    console.warn(`[brand-public] could not link ${from}: copying it instead`);
    copyFileSync(from, to);
  }
}

/** One folder per Unix user (public-1000, public-0): a run as root (docker exec) and the hub's jobs (as the owner) never meet in a folder the other cannot write. */
export const stageRoot = (workspace: string): string => join(workspace, ".reel-studio", `public-${process.getuid?.() ?? "user"}`);

/**
 * Builds the public folder of one brand and returns its path. Each run gets its own folder (named with the process id),
 * so renders that run at the same time never share one. The caller removes it when the run ends (see removeStage).
 */
export function stagePublic(workspace: string, brandsDir: string, slug: string | null, id: string | number = process.pid, sfxDir: string = join(workspace, "sfx")): string {
  const dir = join(stageRoot(workspace), `${slug ?? "default"}-${id}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  if (existsSync(sfxDir)) linkTree(sfxDir, join(dir, "sfx"));
  if (!slug) return dir;
  const brand = join(brandsDir, slug);
  const logo = join(brand, "identity", "logo.png");
  if (existsSync(logo)) linkFile(logo, join(dir, "logo.png"));
  const moves = join(brand, "mascot", "movements");
  if (existsSync(moves)) linkTree(moves, join(dir, "mascot"));
  for (const reel of dirs(join(brand, "reels")).filter((n) => REEL_FOLDER.test(n))) {
    const audio = join(brand, "reels", reel, "audio");
    if (existsSync(audio)) linkTree(audio, join(dir, reel), (name) => FINAL_AUDIO.test(name));
  }
  return dir;
}

export const removeStage = (dir: string): void => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } };

/** True when a process with this id is running (a signal 0 is only a check). */
const alive = (pid: number): boolean => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; } };

/**
 * Removes the folders of runs that were killed before they could clean up: older than `maxAgeMs` and whose process (the number at the end of the
 * folder name) is no longer running. A `remotion studio` left open for days keeps its folder.
 */
export function removeStaleStages(workspace: string, maxAgeMs = 12 * 3600_000, now = Date.now(), isAlive: (pid: number) => boolean = alive): void {
  const root = stageRoot(workspace);
  for (const name of dirs(root)) {
    try {
      if (now - statSync(join(root, name)).mtimeMs <= maxAgeMs) continue;
      const pid = /-(\d+)$/.exec(name)?.[1];
      if (pid && isAlive(Number(pid))) continue;
      removeStage(join(root, name));
    } catch { /* gone already */ }
  }
}
