import { z } from "zod";
import { brandExists } from "../ideas/service.js";
import type { JobSpec } from "../jobs/store.js";
import type { Job } from "../shared/types.js";
import { COLLECT_STEPS, INSIGHTS_STEPS, SERIES_STEPS, SUGGEST_STEPS } from "./handlers.js";

const empty = z.object({}).default({});

export const analyticsJobSchemas = [
  z.object({ type: z.literal("analytics.collect"), params: empty }),
  z.object({ type: z.literal("reel.insights"), params: empty }),
  z.object({ type: z.literal("series.plan"), params: z.object({ focus: z.string().trim().max(300).optional() }).default({}) }),
  z.object({ type: z.literal("schedule.suggest"), params: empty }),
] as const;
export type AnalyticsJobBody = z.infer<(typeof analyticsJobSchemas)[number]>;

export const ANALYTICS_TYPES = new Set(["analytics.collect", "reel.insights", "series.plan", "schedule.suggest"]);
export class AnalyticsJobError extends Error {}

const TITLES = { "analytics.collect": "Read Instagram results", "reel.insights": "Write the readout", "series.plan": "Plan a series", "schedule.suggest": "Suggest best times" } as const;
const STEPS = { "analytics.collect": COLLECT_STEPS, "reel.insights": INSIGHTS_STEPS, "series.plan": SERIES_STEPS, "schedule.suggest": SUGGEST_STEPS } as const;

/** One job of each analytics type at a time. */
export function analyticsSpec(body: AnalyticsJobBody, d: { root: string; dataDir: string; jobs: readonly Job[]; brand: string }): JobSpec {
  if (d.jobs.some((j) => j.type === body.type && j.brand === d.brand && (j.status === "queued" || j.status === "running"))) throw new AnalyticsJobError("This is already running.");
  const params: Record<string, unknown> = { ...body.params, brand: d.brand };
  if ((body.type === "reel.insights" || body.type === "series.plan") && !brandExists(d.dataDir)) throw new AnalyticsJobError("That brand has no reel-questions.md.");
  return { type: body.type, brand: d.brand, title: TITLES[body.type], steps: [...STEPS[body.type]], params };
}
