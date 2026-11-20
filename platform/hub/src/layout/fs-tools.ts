import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, rmdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const sha256 = (file: string): string => createHash("sha256").update(readFileSync(file)).digest("hex");

/** True when `child` is `parent` or inside it. */
export function isInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** Joins a relative path onto a base and throws if the result leaves the base. */
export function safeJoin(base: string, rel: string): string {
  const full = resolve(base, rel);
  if (isAbsolute(rel) || !isInside(base, full) || full === resolve(base)) throw new Error(`"${rel}" is outside ${base}`);
  return full;
}

export type PathFilter = (absolutePath: string, name: string) => boolean;

const lstatOrNull = (p: string) => { try { return lstatSync(p); } catch { return null; } };

/** Every regular file under a path (or the path itself if it is a file), as absolute paths. Symbolic links are skipped. */
export function listFiles(path: string, filter: PathFilter = () => true): string[] {
  const st = lstatOrNull(path);
  if (!st || st.isSymbolicLink()) return [];
  if (st.isFile()) return [path];
  if (!st.isDirectory()) return [];
  const out: string[] = [];
  for (const e of readdirSync(path, { withFileTypes: true })) {
    const p = join(path, e.name);
    if (filter(p, e.name)) out.push(...listFiles(p, filter));
  }
  return out;
}

/** Symbolic links at or under a path (a link at the path itself counts). */
export function findSymlinks(path: string, filter: PathFilter = () => true): string[] {
  const st = lstatOrNull(path);
  if (!st) return [];
  if (st.isSymbolicLink()) return [path];
  if (!st.isDirectory()) return [];
  const out: string[] = [];
  for (const e of readdirSync(path, { withFileTypes: true })) {
    const p = join(path, e.name);
    if (filter(p, e.name)) out.push(...findSymlinks(p, filter));
  }
  return out;
}

export interface Measure { files: number; bytes: number }

export function measure(path: string, filter: PathFilter = () => true): Measure {
  const all = listFiles(path, filter);
  return { files: all.length, bytes: all.reduce((n, f) => n + (lstatOrNull(f)?.size ?? 0), 0) };
}

interface Tree { files: Map<string, string>; dirs: Set<string> }

function walk(root: string, filter: PathFilter): Tree {
  const tree: Tree = { files: new Map(), dirs: new Set() };
  const visit = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (!filter(p, e.name)) continue;
      const rel = relative(root, p);
      if (e.isDirectory()) { tree.dirs.add(rel); visit(p); } else if (e.isFile()) tree.files.set(rel, p);
    }
  };
  const st = lstatOrNull(root);
  if (st?.isDirectory()) visit(root);
  else if (st?.isFile()) tree.files.set("", root);
  return tree;
}

/**
 * Compares a copy with its original, file by file (names, sizes and content hashes) and folder by folder.
 * Returns what differs, empty when the copy is exact.
 */
export function compareTrees(from: string, to: string, filter: PathFilter = () => true): string[] {
  const a = walk(from, filter);
  const b = walk(to, () => true);
  const problems: string[] = [];
  for (const [rel, src] of a.files) {
    const dst = b.files.get(rel);
    if (!dst) { problems.push(`missing: ${rel || to}`); continue; }
    if (lstatSize(src) !== lstatSize(dst)) problems.push(`size differs: ${rel || to}`);
    else if (sha256(src) !== sha256(dst)) problems.push(`content differs: ${rel || to}`);
  }
  for (const rel of b.files.keys()) if (!a.files.has(rel)) problems.push(`unexpected: ${rel}`);
  for (const rel of a.dirs) if (!b.dirs.has(rel)) problems.push(`missing folder: ${rel}`);
  return problems;
}

const lstatSize = (p: string): number => lstatOrNull(p)?.size ?? -1;

/** True when the path, or any folder between `base` and it, is a symbolic link or (for the path itself) not a regular file. */
export function blockedByLinkOrFolder(base: string, path: string): boolean {
  const rel = relative(resolve(base), resolve(path));
  let cur = resolve(base);
  const parts = rel.split(sep).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    cur = join(cur, parts[i] as string);
    const st = lstatOrNull(cur);
    if (!st) return false;
    if (st.isSymbolicLink()) return true;
    if (i === parts.length - 1 && !st.isFile()) return true;
  }
  return false;
}

/** Removes empty folders from `start` upwards, stopping at `stop` (kept). */
export function pruneEmptyDirs(start: string, stop: string): void {
  let dir = resolve(start);
  const top = resolve(stop);
  while (dir !== top && dir.startsWith(top + sep)) {
    try { if (readdirSync(dir).length > 0) return; rmdirSync(dir); } catch { return; }
    dir = dirname(dir);
  }
}

export const exists = (p: string): boolean => existsSync(p) || lstatOrNull(p) !== null;
