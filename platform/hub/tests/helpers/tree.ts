import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/** Writes a file (creating folders) under a test folder. */
export function put(root: string, rel: string, content: string | Buffer = rel, mode?: number): string {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  if (mode !== undefined) chmodSync(file, mode);
  return file;
}

export const read = (root: string, rel: string): string => readFileSync(join(root, rel), "utf8");
export const has = (root: string, rel: string): boolean => existsSync(join(root, rel));

/** Every file under a folder, as sorted relative paths. */
export function files(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(relative(root, p));
    }
  };
  walk(root);
  return out.sort();
}

export const isExecutable = (root: string, rel: string): boolean => (statSync(join(root, rel)).mode & 0o111) !== 0;
