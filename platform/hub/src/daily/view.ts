import { readFileSync } from "node:fs";
import { folderOfKey, resolveReelFile } from "../reels/scanner.js";
import type { Job } from "../shared/types.js";
import type { DailyDeps } from "./deps.js";
import { listPlanDates, readPlan, reconcile, updatePlan } from "./plan.js";
import { todayOf } from "./service.js";
import type { DailyViewData } from "../shared/daily.js";
import { MAX_RERUNS, type DailyPlan, type PlanReel } from "./types.js";

export interface JobBrief { id: string; status: Job["status"]; progress: number; step: string; stepIndex: number; steps: string[]; error: string | null; log: string[] }
const brief = (j: Job | undefined): JobBrief | null => (j ? { id: j.id, status: j.status, progress: j.progress, step: j.step, stepIndex: j.stepIndex, steps: j.steps, error: j.error, log: j.log.slice(-4) } : null);

export interface Check { label: string; ok: boolean }
export interface ReelView extends PlanReel {
  job: JobBrief | null; scheduleJob: JobBrief | null;
  caption: string; checks: Check[]; selfCheck: string;
  mp4Url: string | null; coverUrl: string | null; rerunsLeft: number;
}

const read = (f: string | null) => { try { return f ? readFileSync(f, "utf8") : ""; } catch { return ""; } };

function reelView(d: DailyDeps, r: PlanReel, jobs: readonly Job[]): ReelView {
  const byId = (id: string | null) => jobs.find((j) => j.id === id);
  const key = r.key;
  const reels = d.brand.paths.reelsDir;
  const mp4 = key ? resolveReelFile(reels, folderOfKey(key), "mp4") : null;
  const cover = key ? resolveReelFile(reels, folderOfKey(key), "cover") : null;
  const caption = read(key ? resolveReelFile(reels, folderOfKey(key), "caption") : null);
  const job = byId(r.jobId);
  const checks: Check[] = key ? [
    { label: "MP4 present", ok: !!mp4 }, { label: "Cover present", ok: !!cover },
    { label: "Caption present", ok: caption.trim().length > 0 }, { label: "Caption within 2,200 characters", ok: caption.length <= 2200 },
    { label: "Caption has hashtags", ok: /#[\p{L}\p{N}_]+/u.test(caption) },
  ] : [];
  const url = (kind: string) => `/api/brands/${d.brand.slug}/reels/file?key=${encodeURIComponent(key ?? "")}&kind=${kind}`;
  return {
    ...r, job: brief(job), scheduleJob: brief(byId(r.scheduleJobId)), caption, checks,
    selfCheck: typeof job?.result.summary === "string" ? job.result.summary : "", mp4Url: mp4 ? url("mp4") : null, coverUrl: cover ? url("cover") : null,
    rerunsLeft: Math.max(0, MAX_RERUNS - r.reruns),
  };
}

/** Everything the Daily page shows for one date. Reconciles the plan with its jobs first so the page never lags. */
export function dailyView(d: DailyDeps, date?: string): DailyViewData {
  const today = todayOf(d);
  const day = date ?? today;
  let plan = readPlan(d.config.dataDir, day);
  const jobs = d.store.list();
  if (plan) plan = updatePlan(d.config.dataDir, day, (p) => reconcile(p, jobs, d.now()));
  return {
    today, date: day, dates: listPlanDates(d.config.dataDir).slice(0, 14), plan,
    job: brief(jobs.find((j) => j.id === plan?.jobId)), reels: plan ? plan.reels.map((r) => reelView(d, r, jobs)) : [],
    settings: d.settings.get().daily,
  };
}
