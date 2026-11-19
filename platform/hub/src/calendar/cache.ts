import type { RawPost } from "./merge.js";

interface Entry { at: number; weeks: number; posts: RawPost[] }
/** One reading of the Instagram calendar per brand: each brand has its own account. */
const entries = new Map<string, Entry>();
export const CACHE_MS = 120_000;

export const readCache = (brand: string, weeks: number, now = Date.now()): { entry: Entry; fresh: boolean } | null => {
  const entry = entries.get(brand);
  return entry && entry.weeks >= weeks ? { entry, fresh: now - entry.at < CACHE_MS } : null;
};
export const writeCache = (brand: string, weeks: number, posts: RawPost[], now = Date.now()): void => { entries.set(brand, { at: now, weeks, posts }); };
export const lastPosts = (brand: string): RawPost[] => entries.get(brand)?.posts ?? [];
export const invalidateCalendar = (brand?: string): void => { if (brand) entries.delete(brand); else entries.clear(); };
