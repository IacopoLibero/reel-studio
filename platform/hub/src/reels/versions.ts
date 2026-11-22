import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
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

/** Every file the snapshot would hold, as `relative path -> bytes`. */
function deliverables(root: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const walk = (dir: string, rel: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (rel !== "" || e.name === "code") walk(join(dir, e.name), r); }
      else if (rel !== "" || FILES.some((re) => re.test(e.name))) out.set(r, readFileSync(join(dir, e.name)));
    }
  };
  walk(root, "");
  return out;
}

/**
 * After a run: when the reel is exactly as the snapshot (a question, a stopped or failed run), the snapshot is removed, so it does not push
 * a real earlier version out of the newest three. Returns true when it was removed.
 */
export function dropSnapshotIfUnchanged(reelDir: string, name: string): boolean {
  const snap = join(reelDir, VERSIONS_DIR, name);
  try { if (!statSync(snap).isDirectory()) return false; } catch { return false; }
  const now = deliverables(reelDir), then = deliverables(snap);
  if (now.size !== then.size || [...then].some(([k, v]) => !now.get(k)?.equals(v))) return false;
  rmSync(snap, { recursive: true, force: true });
  return true;
}
