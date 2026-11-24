import { z } from "zod";
import { ideaSchema } from "../ideas/schema.js";

export const PLAN_STATUSES = ["collecting", "analysing", "ideas", "awaiting_approval", "creating", "awaiting_review", "scheduling", "done", "skipped", "failed"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const REEL_STATES = ["making", "review", "scheduling", "scheduled", "failed", "dropped"] as const;
export type ReelState = (typeof REEL_STATES)[number];

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const line = z.string().trim().max(400);

export const dailyIdeaSchema = ideaSchema.extend({
  id: z.string(),
  basedOnData: z.string().trim().min(3, "Each idea needs a basedOnData line.").max(300),
  threads: z.string().trim().max(500).nullable().default(null),
  closing: z.enum(["A", "B"]),
});
export type DailyIdea = z.infer<typeof dailyIdeaSchema>;

export const proposalSchema = z.object({ id: z.string(), title: line.min(3), target: line.default(""), change: z.string().trim().max(1200), why: z.string().trim().max(600).default("") });
export type Proposal = z.infer<typeof proposalSchema>;

export const readoutSchema = z.object({
  text: z.string().max(4000), repeat: z.array(line).max(5).default([]), stop: z.array(line).max(5).default([]),
  hookPatterns: z.array(line).max(5).default([]), bestTimes: z.array(line).max(8).default([]),
});
export type Readout = z.infer<typeof readoutSchema>;

export const planReelSchema = z.object({
  ideaId: z.string(), question: z.string(), closing: z.enum(["A", "B"]),
  jobId: z.string().nullable(), folder: z.string().nullable(), key: z.string().nullable(),
  state: z.enum(REEL_STATES), reruns: z.number().int().min(0), note: z.string().default(""), error: z.string().nullable().default(null),
  scheduleJobId: z.string().nullable().default(null), slot: z.string().nullable().default(null), offerDropped: z.boolean().default(false),
});
export type PlanReel = z.infer<typeof planReelSchema>;

export const planSchema = z.object({
  date: z.string().regex(DATE_RE), status: z.enum(PLAN_STATUSES), createdAt: z.string(), updatedAt: z.string(),
  jobId: z.string().nullable(), step: z.string().default(""), progress: z.number().min(0).max(1).default(0), error: z.string().nullable().default(null),
  warnings: z.array(z.string()).default([]),
  collect: z.object({ ok: z.boolean(), stub: z.boolean(), note: z.string() }).nullable().default(null),
  readout: readoutSchema.nullable().default(null),
  proposals: z.array(proposalSchema).default([]),
  ideas: z.array(dailyIdeaSchema).default([]),
  skillsUsed: z.array(z.string()).default([]), skillsMissing: z.array(z.string()).default([]),
  reels: z.array(planReelSchema).default([]),
  notificationId: z.string().nullable().default(null),
});
export type DailyPlan = z.infer<typeof planSchema>;

export const REQUIRED_SKILLS = ["ootto-agent-reach", "reel-research", "reel-hooks", "reel-insights", "ootto-hook-mining", "ootto-best-time-scheduler"] as const;
export const MAX_RERUNS = 2;
