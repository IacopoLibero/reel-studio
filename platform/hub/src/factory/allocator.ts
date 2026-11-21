import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STALE_MS = 30_000;
const tails = new Map<string, Promise<unknown>>();

/** Cross-process lock (a directory created atomically) plus an in-process queue. Stale locks are broken after 30 s. */
export async function withFileLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(lockPath) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(async () => {
    mkdirSync(dirname(lockPath), { recursive: true });
    for (;;) {
      try { mkdirSync(lockPath); break; } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        try { if (Date.now() - statSync(lockPath).mtimeMs > STALE_MS) rmSync(lockPath, { recursive: true, force: true }); } catch { /* released meanwhile */ }
        await sleep(25);
      }
    }
    try { return await fn(); } finally { rmSync(lockPath, { recursive: true, force: true }); }
  });
  tails.set(lockPath, run);
  return run;
}

const FILLER = new Set(["a", "an", "the", "do", "does", "did", "you", "your", "is", "are", "was", "what", "which", "how", "why", "who", "when", "to", "of", "in", "on", "for", "and", "or", "it", "its", "s", "can", "that", "this", "with", "from", "about", "i", "my", "we", "our", "they", "their", "have", "has", "been", "be"]);

/** A short folder name from a question: up to five words that are not filler. */
export function shortName(question: string): string {
  const words = question.toLowerCase().replace(/['’]/g, "").split(/[^a-z0-9]+/).filter((w) => w && !FILLER.has(w));
  return words.slice(0, 5).join("-") || "reel";
}

const SAFE_BRAND = /^[A-Za-z0-9_-]+$/;

/** Picks the next free reel number for a brand and creates its folder, so parallel jobs never share a number. */
export async function allocateReelFolder(root: string, brand: string, question: string, lockDir: string): Promise<{ n: number; folder: string; path: string }> {
  if (!SAFE_BRAND.test(brand)) throw new Error("Invalid brand name.");
  return withFileLock(join(lockDir, `alloc-${brand}.lock`), async () => {
    const base = join(root, "brand", brand, "reels");
    mkdirSync(base, { recursive: true });
    const used = readdirSync(base).map((f) => /^(\d+)-/.exec(f)?.[1]).filter((x): x is string => !!x).map(Number);
    const n = used.length ? Math.max(...used) + 1 : 0;
    const folder = `${n}-${shortName(question)}`;
    const path = join(base, folder);
    mkdirSync(path);
    return { n, folder, path };
  });
}
