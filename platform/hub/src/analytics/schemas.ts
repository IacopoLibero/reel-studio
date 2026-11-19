import { z } from "zod";

const num = z.number().finite().optional();

export const metricsSchema = z.object({
  plays: num, reach: num, likes: num, comments: num, saves: num, shares: num, interactions: num,
  avgWatchMs: num, totalWatchMs: num, skipRate: num,
});
export type Metrics = z.infer<typeof metricsSchema>;
export type MetricKey = keyof Metrics;

export const mediaSchema = z.object({
  id: z.string(),
  permalink: z.string(),
  captionStart: z.string(),
  hook: z.string(),
  postedAt: z.string(),
  mediaType: z.string(),
  productType: z.string(),
  reel: z.object({ key: z.string(), n: z.number(), name: z.string(), closing: z.enum(["A", "B"]).nullable() }).nullable(),
  metrics: metricsSchema,
  insights: z.enum(["ok", "partial", "too_early", "none"]),
  skipped: z.array(z.string()),
});
export type MediaRecord = z.infer<typeof mediaSchema>;

export const snapshotSchema = z.object({
  version: z.literal(1),
  collectedAt: z.string(),
  igUserId: z.string(),
  warnings: z.array(z.string()).default([]),
  media: z.array(mediaSchema),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

/** Names of the Graph API insights and the metric each one fills. */
export const GRAPH_TO_METRIC: Readonly<Record<string, MetricKey>> = {
  views: "plays", reach: "reach", likes: "likes", comments: "comments", saved: "saves", shares: "shares",
  total_interactions: "interactions", ig_reels_avg_watch_time: "avgWatchMs", ig_reels_video_view_total_time: "totalWatchMs", reels_skip_rate: "skipRate",
};
export const REEL_GRAPH_METRICS: readonly string[] = Object.keys(GRAPH_TO_METRIC);

export const readoutSchema = z.object({ date: z.string(), markdown: z.string() });
