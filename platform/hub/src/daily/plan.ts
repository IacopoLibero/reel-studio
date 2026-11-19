import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Job } from "../shared/types.js";
import { DATE_RE, MAX_RERUNS, planSchema, type DailyPlan, type PlanReel, type PlanStatus } from "./types.js";

export class PlanError extends Error {}

const ALLOWED: Record<PlanStatus, readonly PlanStatus[]> = {
  collecting: ["analysing", "failed"],
  analysing: ["ideas", "failed"],
  ideas: ["awaiting_approval", "failed"],
  awaiting_approval: ["creating", "skipped"],
  creating: ["awaiting_review", "scheduling", "done", "failed"],
  awaiting_review: ["creating", "scheduling", "done"],
  scheduling: ["awaiting_review", "creating", "done"],
  done: [],
  skipped: [],
  failed: ["collecting"],
};

export const canTransition = (from: PlanStatus, to: PlanStatus): boolean => ALLOWED[from].includes(to);
export const isTerminal = (s: PlanStatus): boolean => s === "done" || s === "skipped";

/** Returns a new plan in status `to`, or throws when the move is not allowed. Never mutates. */
export function transition(plan: DailyPlan, to: PlanStatus, patch: Partial<DailyPlan> = {}, now = new Date()): DailyPlan {
  if (!canTransition(plan.status, to)) throw new PlanError(`A plan that is ${plan.status} cannot become ${to}.`);
  return { ...plan, ...patch, status: to, error: to === "failed" ? (patch.error ?? plan.error) : (patch.error ?? null), updatedAt: now.toISOString() };
}

export function newPlan(date: string, now = new Date()): DailyPlan {
  const t = now.toISOString();
  return planSchema.parse({ date, status: "collecting", createdAt: t, updatedAt: t, jobId: null });
}

const active = (j: Job | undefined) => !!j && (j.status === "queued" || j.status === "running");

/** The status a plan in the second half of the pipeline should have, from its reels. */
export function deriveStatus(reels: readonly PlanReel[]): PlanStatus {
  if (reels.some((r) => r.state === "making")) return "creating";
  if (reels.some((r) => r.state === "review")) return "awaiting_review";
  if (reels.some((r) => r.state === "scheduling")) return "scheduling";
  return "done";
}

/** Brings a plan in line with its jobs: finished makes go to review, finished schedules to scheduled, dead jobs fail. */
export function reconcile(plan: DailyPlan, jobs: readonly Job[], now = new Date()): DailyPlan {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  if (plan.status === "collecting" || plan.status === "analysing" || plan.status === "ideas") {
    const job = plan.jobId ? byId.get(plan.jobId) : undefined;
    if (job && (job.status === "failed" || job.status === "cancelled")) return transition(plan, "failed", { error: job.error ?? "The daily run was stopped." }, now);
    return plan;
  }
  if (plan.status === "awaiting_approval" || plan.status === "done" || plan.status === "skipped" || plan.status === "failed") return plan;
  const reels = plan.reels.map((r): PlanReel => {
    if (r.state === "making") {
      const j = r.jobId ? byId.get(r.jobId) : undefined;
      if (!j || active(j)) return r;
      if (j.status === "done") {
        const folder = String(j.result.folder ?? r.folder ?? "");
        return { ...r, state: "review", folder: folder || null, key: String(j.result.key ?? r.key ?? "") || null, error: null };
      }
      return { ...r, state: "failed", error: j.error ?? "The reel job did not finish." };
    }
    if (r.state === "scheduling") {
      const j = r.scheduleJobId ? byId.get(r.scheduleJobId) : undefined;
      if (!j || active(j)) return r;
      return j.status === "done" ? { ...r, state: "scheduled", error: null } : { ...r, state: "review", error: j.error ?? "Scheduling did not finish.", scheduleJobId: null };
    }
    return r;
  });
  const changed = reels.some((r, i) => r !== plan.reels[i]);
  const target = deriveStatus(reels);
  if (!changed && target === plan.status) return plan;
  const next = { ...plan, reels, updatedAt: now.toISOString() };
  return target === plan.status ? next : transition(next, target, {}, now);
}

/** Moves to `to`, or just refreshes the timestamp when the plan is already there (several reels share one plan status). */
const settle = (plan: DailyPlan, to: PlanStatus, now: Date): DailyPlan => (plan.status === to ? { ...plan, updatedAt: now.toISOString() } : transition(plan, to, {}, now));

export const canRerun = (r: PlanReel): boolean => r.state === "review" && r.reruns < MAX_RERUNS;

/** The reel goes back to making with a new job and the reviewer's note. */
export function markRerun(plan: DailyPlan, ideaId: string, jobId: string, note: string, now = new Date()): DailyPlan {
  const r = plan.reels.find((x) => x.ideaId === ideaId);
  if (!r || !canRerun(r)) throw new PlanError("This reel cannot be rerun any more.");
  const reels = plan.reels.map((x) => (x === r ? { ...x, state: "making" as const, jobId, reruns: x.reruns + 1, note, error: null } : x));
  return settle({ ...plan, reels }, deriveStatus(reels), now);
}

export function markDropped(plan: DailyPlan, ideaId: string, note: string, now = new Date()): DailyPlan {
  const reels = plan.reels.map((x) => (x.ideaId === ideaId && x.state === "review" ? { ...x, state: "dropped" as const, note } : x));
  return settle({ ...plan, reels }, deriveStatus(reels), now);
}

export function markScheduling(plan: DailyPlan, ideaId: string, jobId: string, slot: string, dropOffer: boolean, now = new Date()): DailyPlan {
  const reels = plan.reels.map((x) => (x.ideaId === ideaId && x.state === "review" ? { ...x, state: "scheduling" as const, scheduleJobId: jobId, slot, offerDropped: dropOffer, error: null } : x));
  return settle({ ...plan, reels }, deriveStatus(reels), now);
}

// ---- persistence: data/daily/<date>.json

export const dailyDir = (dataDir: string) => join(dataDir, "daily");

export function writePlan(dataDir: string, plan: DailyPlan): void {
  const dir = dailyDir(dataDir);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${plan.date}.json`);
  writeFileSync(`${file}.tmp`, JSON.stringify(plan, null, 2));
  renameSync(`${file}.tmp`, file);
}

export function readPlan(dataDir: string, date: string): DailyPlan | null {
  if (!DATE_RE.test(date)) return null;
  const file = join(dailyDir(dataDir), `${date}.json`);
  if (!existsSync(file)) return null;
  try { return planSchema.parse(JSON.parse(readFileSync(file, "utf8"))); } catch { return null; }
}

export function listPlanDates(dataDir: string): string[] {
  try { return readdirSync(dailyDir(dataDir)).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).filter((d) => DATE_RE.test(d)).sort().reverse(); } catch { return []; }
}

/** Reads, applies `fn` (pure) and writes back. Throws when the plan does not exist. */
export function updatePlan(dataDir: string, date: string, fn: (p: DailyPlan) => DailyPlan): DailyPlan {
  const cur = readPlan(dataDir, date);
  if (!cur) throw new PlanError(`There is no plan for ${date}.`);
  const next = fn(cur);
  if (next !== cur) writePlan(dataDir, next);
  return next;
}
