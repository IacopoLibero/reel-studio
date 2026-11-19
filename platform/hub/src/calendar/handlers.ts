import { join } from "node:path";
import type { Handler } from "../jobs/handlers.js";
import { loadScheduler, targetOf } from "../scheduler-bridge.js";
import { invalidateCalendar } from "./cache.js";
import { applyDelete, applyReschedule } from "./state.js";

const ref = (p: Record<string, unknown>) => ({ captionStart: String(p.captionStart), scheduledAt: String(p.scheduledAt) });

export const instagramReschedule: Handler = async (job, ctx) => {
  const sched = await loadScheduler();
  ctx.update({ step: "Open calendar", stepIndex: 0, progress: 0.05, log: `Moving ${job.params.captionStart} to ${job.params.date} ${job.params.time}` });
  const out = await sched.rescheduleScheduled(ref(job.params), String(job.params.newAt), { update: ctx.update, signal: ctx.signal, settings: ctx.settings, ...(ctx.brand ? { target: targetOf(ctx.brand) } : {}) });
  applyReschedule(join(ctx.dataDir, "scheduled.json"), (job.params.reelKey as string | null) ?? null, String(job.params.newAt), ctx.settings.slotPattern.timezone);
  invalidateCalendar(ctx.brand?.slug);
  return out ?? {};
};

export const instagramDelete: Handler = async (job, ctx) => {
  const sched = await loadScheduler();
  ctx.update({ step: "Open calendar", stepIndex: 0, progress: 0.05, log: `Deleting ${job.params.captionStart}` });
  const out = await sched.deleteScheduled(ref(job.params), { update: ctx.update, signal: ctx.signal, settings: ctx.settings, ...(ctx.brand ? { target: targetOf(ctx.brand) } : {}) });
  applyDelete(join(ctx.dataDir, "scheduled.json"), (job.params.reelKey as string | null) ?? null);
  invalidateCalendar(ctx.brand?.slug);
  return out ?? {};
};
