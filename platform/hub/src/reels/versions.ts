import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/** Where the previous versions of a reel are kept, inside the reel's folder. */
export const VERSIONS_DIR = ".versions";
const KEEP = 3;
/** What a change to a reel can touch. The audio is left out: it is large and most edits do not change it. */
const FILES = [/\.mp4$/i, /^caption\.md$/, /^cover\.(png|json)$/, /^script\.json$/, /^plan\.md$/, /-props\.json$/];

/**
 * Copies the reel as it is (video, caption, cover, script, plan, code) into `.versions/<time>/` before a chat edit changes it,
 * and keeps the newest three. Returns the name of the new snapshot.
 */
export function snapshotReel(reelDir: string, now: Date = new Date()): string {
  const name = now.toISOString().replace(/[:.]/g, "-");
  const to = join(reelDir, VERSIONS_DIR, name);
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(reelDir, { withFileTypes: true })) {
    if (f.isFile() && FILES.some((re) => re.test(f.name))) cpSync(join(reelDir, f.name), join(to, f.name));
  }
  if (existsSync(join(reelDir, "code"))) cpSync(join(reelDir, "code"), join(to, "code"), { recursive: true });
  const all = readdirSync(join(reelDir, VERSIONS_DIR)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP))) rmSync(join(reelDir, VERSIONS_DIR, old), { recursive: true, force: true });
  return name;
}
