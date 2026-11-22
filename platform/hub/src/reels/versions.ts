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
export function snapshotReel(reelDir: string, now: Date = new Date(), prune = true): string {
  const name = now.toISOString().replace(/[:.]/g, "-");
  const to = join(reelDir, VERSIONS_DIR, name);
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(reelDir, { withFileTypes: true })) {
    if (f.isFile() && FILES.some((re) => re.test(f.name))) cpSync(join(reelDir, f.name), join(to, f.name));
  }
  if (existsSync(join(reelDir, "code"))) cpSync(join(reelDir, "code"), join(to, "code"), { recursive: true });
  if (prune) pruneVersions(reelDir);
  return name;
}

/** Keeps the newest three versions. */
export function pruneVersions(reelDir: string): void {
  const all = readdirSync(join(reelDir, VERSIONS_DIR)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP))) rmSync(join(reelDir, VERSIONS_DIR, old), { recursive: true, force: true });
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

export interface ReelVersion { name: string; at: string; /** The video of that version exists (a version taken before a video was made has none). */ hasVideo: boolean }

const nameToIso = (name: string): string => name.replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3}Z)$/, "$1:$2:$3.$4");

/** The saved versions of a reel, newest first. */
export function listVersions(reelDir: string): ReelVersion[] {
  let names: string[];
  try { names = readdirSync(join(reelDir, VERSIONS_DIR), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; }
  return names.sort().reverse().map((name) => ({
    name, at: nameToIso(name),
    hasVideo: readdirSync(join(reelDir, VERSIONS_DIR, name)).some((f) => /\.mp4$/i.test(f)),
  }));
}

const SAFE_VERSION = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;

/**
 * Puts a saved version back: its video, caption, cover, script, plan and code replace the current ones (files the change added to `code/` are removed),
 * the audio is left as it is. The reel as it is now is saved first, so an undo can itself be undone.
 */
export function restoreVersion(reelDir: string, name: string, now: Date = new Date()): void {
  const from = join(reelDir, VERSIONS_DIR, name);
  if (!SAFE_VERSION.test(name) || !existsSync(from)) throw new Error("That version was not found.");
  snapshotReel(reelDir, now, false); // not pruned yet: the version being restored may be the oldest
  // The saved files that are deliverables of the reel (not the code folder): remove the current ones, copy the saved ones.
  for (const f of readdirSync(reelDir, { withFileTypes: true })) {
    if (f.isFile() && FILES.some((re) => re.test(f.name))) rmSync(join(reelDir, f.name), { force: true });
  }
  for (const f of readdirSync(from, { withFileTypes: true })) {
    if (f.isFile()) cpSync(join(from, f.name), join(reelDir, f.name));
  }
  if (existsSync(join(from, "code"))) {
    rmSync(join(reelDir, "code"), { recursive: true, force: true });
    cpSync(join(from, "code"), join(reelDir, "code"), { recursive: true });
  }
  pruneVersions(reelDir);
}
