import type { Job, JobPatch, Settings } from "./shared/types.js";
import type { BrandCtx } from "./brands/context.js";
import { offerOf } from "./brands/offer.js";
import type { SchedulerTarget } from "./scheduler/types.js";

export type { SchedulerTarget } from "./scheduler/types.js";

/** What the scheduler needs to know about the brand a browser flow works for. */
export function targetOf(b: BrandCtx): SchedulerTarget {
  return { slug: b.slug, profileDir: b.paths.profileDir, dataDir: b.paths.dataDir, offer: offerOf(b.brand) };
}

export interface ScheduleCtx {
  update: (patch: JobPatch) => void;
  signal: AbortSignal;
  settings: Settings;
  target?: SchedulerTarget;
}
export interface ScheduledPost { id: string; scheduledAt: string; captionStart: string; thumbnail?: string }
export interface PostRef { captionStart: string; scheduledAt: string }
export interface SchedulerApi {
  listScheduled: (opts?: { weeks?: number }, ctx?: { target?: SchedulerTarget }) => Promise<ScheduledPost[]>;
  rescheduleScheduled: (post: PostRef, newAt: string, ctx?: Partial<ScheduleCtx>) => Promise<Record<string, unknown> | void>;
  deleteScheduled: (post: PostRef, ctx?: Partial<ScheduleCtx>) => Promise<Record<string, unknown> | void>;
  runScheduleJob: (job: Job, ctx: ScheduleCtx) => Promise<Record<string, unknown> | void>;
  getSessionStatus: (target?: SchedulerTarget) => Promise<Record<string, unknown>>;
  openLoginWindow: (target?: SchedulerTarget) => Promise<Record<string, unknown> | void>;
  stub: boolean;
  calendarReady?: boolean;
}

// STUB: used only while ./scheduler/index.js (owned by the scheduler agent) does not exist.
const stub: SchedulerApi = {
  stub: true,
  async listScheduled() { throw new Error("The Instagram scheduler cannot read the calendar yet (stub)."); },
  async rescheduleScheduled() { throw new Error("The Instagram scheduler cannot reschedule yet (stub)."); },
  async deleteScheduled() { throw new Error("The Instagram scheduler cannot delete yet (stub)."); },
  async runScheduleJob() { throw new Error("The Instagram scheduler module is not installed yet (stub)."); },
  async getSessionStatus() { return { loggedIn: false, state: "unavailable", message: "Scheduler module not installed (stub)." }; },
  async openLoginWindow() { return { opened: false, message: "Scheduler module not installed (stub)." }; },
};

let cached: Promise<SchedulerApi> | null = null;

export function loadScheduler(): Promise<SchedulerApi> {
  cached ??= (async () => {
    const spec = process.env.HUB_SCHEDULER_MODULE ?? "./scheduler/index.js";
    if (process.env.HUB_SCHEDULER === "off") return stub;
    try {
      const mod = (await import(spec)) as Partial<SchedulerApi>;
      if (typeof mod.runScheduleJob === "function" && typeof mod.getSessionStatus === "function" && typeof mod.openLoginWindow === "function") {
        return { listScheduled: mod.listScheduled ?? stub.listScheduled, rescheduleScheduled: mod.rescheduleScheduled ?? stub.rescheduleScheduled, deleteScheduled: mod.deleteScheduled ?? stub.deleteScheduled, calendarReady: typeof mod.listScheduled === "function", runScheduleJob: mod.runScheduleJob, getSessionStatus: mod.getSessionStatus, openLoginWindow: mod.openLoginWindow, stub: false };
      }
      console.warn("scheduler module lacks the expected exports: using the stub");
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      console.warn(`scheduler module failed to load (${code ?? "error"}): ${(e as Error).message}`);
    }
    return stub;
  })();
  return cached;
}
