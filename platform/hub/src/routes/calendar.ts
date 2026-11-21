import type { FastifyInstance } from "fastify";
import { buildCalendarJobSpec, CalendarJobError, type CalendarAction, type KnownPost } from "../calendar/jobs.js";
import { readCache, writeCache, lastPosts } from "../calendar/cache.js";
import { buildCalendar, matchReel, toLocal, type RawPost } from "../calendar/merge.js";
import { calendarQuerySchema, deleteSchema, rescheduleSchema } from "../calendar/schemas.js";
import { loadReelRefs } from "../calendar/service.js";
import { addDays, weekOf } from "../shared/calendar-grid.js";
import { readScheduled } from "../reels/scanner.js";
import { loadScheduler, targetOf } from "../scheduler-bridge.js";
import type { CalendarData, Job } from "../shared/types.js";
import type { AppDeps } from "../app.js";
import type { Scope } from "./scope.js";
import type { BrandCtx } from "../brands/context.js";

const BROWSER_TYPES = new Set(["instagram.schedule", "instagram.reschedule", "instagram.delete"]);
const running = (jobs: Job[]) => jobs.find((j) => BROWSER_TYPES.has(j.type) && j.status === "running");

export function calendarRoutes(app: FastifyInstance, d: AppDeps, scope: Scope): void {
  const checked = new Map<string, string>();

  async function posts(b: BrandCtx, weeks: number, fresh: boolean): Promise<{ posts: RawPost[]; stale: boolean; error: string | null; stub: boolean }> {
    const sched = await loadScheduler();
    const hit = readCache(b.slug, weeks);
    if (hit?.fresh && !fresh) return { posts: hit.entry.posts, stale: false, error: null, stub: sched.stub };
    if (running(d.store.list())) return { posts: lastPosts(b.slug), stale: true, error: "A browser job is running; showing the last reading.", stub: sched.stub };
    try {
      const list = await sched.listScheduled({ weeks }, { target: targetOf(b) });
      writeCache(b.slug, weeks, list);
      checked.set(b.slug, new Date().toISOString());
      return { posts: list, stale: false, error: null, stub: sched.stub };
    } catch (e) {
      return { posts: lastPosts(b.slug), stale: true, error: (e as Error).message, stub: sched.stub };
    }
  }

  const known = async (b: BrandCtx): Promise<KnownPost[]> => {
    const tz = d.settings.get(b.slug).slotPattern.timezone;
    const reels = loadReelRefs(b.paths.dataDir, b.slug);
    return lastPosts(b.slug).map((p) => {
      const r = matchReel(p.captionStart, reels);
      return { ...p, ...toLocal(p.scheduledAt, tz), reelKey: r?.key ?? null, reelN: r?.n ?? null };
    });
  };

  app.get("/calendar", async (req, reply) => {
    const b = scope(req);
    const q = calendarQuerySchema.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: q.error.issues[0]?.message ?? "Invalid request." });
    const pattern = d.settings.get(b.slug).slotPattern;
    const now = new Date();
    const today = toLocal(now.toISOString(), pattern.timezone).date;
    const from = weekOf(today)[0] as string;
    const to = addDays(from, q.data.weeks * 7 - 1);
    const got = await posts(b, q.data.weeks, q.data.fresh);
    const jobs = d.store.list().filter((j) => j.brand === b.slug || j.brand === undefined);
    const merged = buildCalendar({ posts: got.posts, reels: loadReelRefs(b.paths.dataDir, b.slug), jobs, local: readScheduled(b.paths.scheduledFile), pattern, from, to, now });
    const busy = running(jobs);
    const out: CalendarData = {
      checkedAt: checked.get(b.slug) ?? null, stale: got.stale, error: got.error, stub: got.stub, from, to, today, timezone: pattern.timezone, ...merged,
      busyJob: busy ? { id: busy.id, title: busy.title, progress: busy.progress, step: busy.step, type: busy.type } : null,
    };
    return out;
  });

  const create = async (b: BrandCtx, action: CalendarAction, reply: import("fastify").FastifyReply) => {
    try {
      const spec = buildCalendarJobSpec(action, { settings: d.settings.get(b.slug), jobs: d.store.list(), posts: await known(b), now: new Date() });
      const job = d.store.create({ ...spec, brand: b.slug });
      d.runner.enqueue(job);
      return reply.code(201).send(job);
    } catch (e) {
      if (e instanceof CalendarJobError) return reply.code(409).send({ error: e.message });
      throw e;
    }
  };

  app.post("/calendar/reschedule", async (req, reply) => {
    const b = rescheduleSchema.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: b.error.issues[0]?.message ?? "Invalid request." });
    return create(scope(req), { kind: "reschedule", ...b.data }, reply);
  });

  app.post("/calendar/delete", async (req, reply) => {
    const b = deleteSchema.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: b.error.issues[0]?.message ?? "Invalid request." });
    return create(scope(req), { kind: "delete", id: b.data.id }, reply);
  });
}
