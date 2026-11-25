import type { MediaRecord } from "./schemas.js";
import { readPageRows } from "./page.js";
import type { PageRow } from "./page-types.js";
import { latestReadout, latestSnapshot, listSnapshotDates } from "./store.js";

export interface AnalyticsView {
  collectedAt: string | null;
  dates: string[];
  warnings: string[];
  reels: MediaRecord[];
  readout: { date: string; markdown: string } | null;
  /** The whole page per platform: one row a day, oldest first. */
  pages: { platform: string; rows: PageRow[] }[];
}

const PLATFORMS = ["instagram", "threads", "tiktok"] as const;

/** Everything the Analytics page shows: the reels of the newest snapshot (oldest first, for the chart) and the latest readout. */
export function analyticsView(dataDir: string): AnalyticsView {
  const snap = latestSnapshot(dataDir);
  const reels = (snap?.media ?? []).filter((m) => m.productType === "REELS").sort((a, b) => Date.parse(a.postedAt) - Date.parse(b.postedAt));
  return { collectedAt: snap?.collectedAt ?? null, dates: listSnapshotDates(dataDir), warnings: snap?.warnings ?? [], reels, readout: latestReadout(dataDir), pages: PLATFORMS.map((platform) => ({ platform, rows: readPageRows(dataDir, platform) })).filter((p) => p.rows.length > 0) };
}
