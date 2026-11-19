import type { MediaRecord } from "./schemas.js";

export const HOOKS_HEADER = ["hook", "plays", "reach", "saves", "shares", "likes", "comments", "posted_at", "reel"] as const;

/** Quotes a cell when needed and defuses spreadsheet formulas. */
function cell(v: string | number | undefined | null): string {
  if (v === undefined || v === null) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** data/analytics/hooks.csv: one row per reel, newest first, for hook-mining. */
export function toHooksCsv(media: readonly MediaRecord[]): string {
  const rows = media
    .filter((m) => m.productType === "REELS")
    .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt))
    .map((m) => [m.hook || m.captionStart, m.metrics.plays, m.metrics.reach, m.metrics.saves, m.metrics.shares, m.metrics.likes, m.metrics.comments, m.postedAt, m.reel?.key ?? ""].map(cell).join(","));
  return `${[HOOKS_HEADER.join(","), ...rows].join("\n")}\n`;
}
