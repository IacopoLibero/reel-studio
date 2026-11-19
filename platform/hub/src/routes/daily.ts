import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import type { BrandCtx } from "../brands/context.js";
import type { Scope } from "./scope.js";
import { DailyError, type DailyDeps } from "../daily/deps.js";
import { NotificationStore } from "../daily/notifications.js";
import { confirmReel, discardReel, rejectReel, slotOptions } from "../daily/review.js";
import { approve, skip, startRun, todayOf } from "../daily/service.js";
import { dailyView } from "../daily/view.js";
import { DATE_RE } from "../daily/types.js";

const date = z.string().regex(DATE_RE);
const id = z.string().regex(/^[0-9a-f]{12}$/);

/** The daily loop of one brand: its data folder holds the plans, locks and notifications, and its own settings and gates apply. */
export function makeDailyDeps(d: AppDeps, brand: BrandCtx): DailyDeps {
  return { config: { ...d.config, dataDir: brand.paths.dataDir }, brand, store: d.store, settings: d.settings.forBrand(brand.slug), runner: d.runner, notes: NotificationStore.at(brand.paths.dataDir), now: () => new Date() };
}

export function dailyRoutes(app: FastifyInstance, d: AppDeps, scope: Scope, deps: (b: BrandCtx) => DailyDeps = (b) => makeDailyDeps(d, b)): void {
  const fail = (reply: FastifyReply, e: unknown) => {
    if (e instanceof DailyError) return reply.code(e.status).send({ error: e.message, ...(e.code ? { code: e.code } : {}) });
    throw e;
  };
  const bad = (reply: FastifyReply, e: z.ZodError) => reply.code(400).send({ error: e.issues[0]?.message ?? "Invalid request." });

  app.get<{ Querystring: { date?: string } }>("/daily", async (req, reply) => {
    const dd = deps(scope(req));
    const q = date.optional().safeParse(req.query.date);
    return q.success ? dailyView(dd, q.data) : bad(reply, q.error);
  });

  app.post("/daily/run", async (req, reply) => { const dd = deps(scope(req)); try { startRun(dd, todayOf(dd)); return reply.code(201).send(dailyView(dd)); } catch (e) { return fail(reply, e); } });

  const approveBody = z.object({ date, picks: z.array(z.object({ ideaId: id, closing: z.enum(["A", "B"]) })).min(1).max(10) });
  app.post("/daily/approve", async (req, reply) => {
    const dd = deps(scope(req));
    const b = approveBody.safeParse(req.body);
    if (!b.success) return bad(reply, b.error);
    try { await approve(dd, b.data.date, b.data.picks); return dailyView(dd, b.data.date); } catch (e) { return fail(reply, e); }
  });

  app.post("/daily/skip", async (req, reply) => {
    const dd = deps(scope(req));
    const b = z.object({ date }).safeParse(req.body);
    if (!b.success) return bad(reply, b.error);
    try { skip(dd, b.data.date); return dailyView(dd, b.data.date); } catch (e) { return fail(reply, e); }
  });

  app.get<{ Querystring: { date?: string; idea?: string } }>("/daily/slots", async (req, reply) => {
    const dd = deps(scope(req));
    const q = z.object({ date, idea: id }).safeParse(req.query);
    if (!q.success) return bad(reply, q.error);
    try { return slotOptions(dd, q.data.date, q.data.idea); } catch (e) { return fail(reply, e); }
  });

  const confirmBody = z.object({ date, idea: id, slotDate: date, slotTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), dropOffer: z.boolean().default(false) });
  app.post("/daily/confirm", async (req, reply) => {
    const dd = deps(scope(req));
    const b = confirmBody.safeParse(req.body);
    if (!b.success) return bad(reply, b.error);
    try { confirmReel(dd, b.data.date, b.data.idea, { date: b.data.slotDate, time: b.data.slotTime, dropOffer: b.data.dropOffer }); return dailyView(dd, b.data.date); } catch (e) { return fail(reply, e); }
  });

  const rejectBody = z.object({ date, idea: id, note: z.string().max(1000), discard: z.boolean().default(false) });
  app.post("/daily/reject", async (req, reply) => {
    const dd = deps(scope(req));
    const b = rejectBody.safeParse(req.body);
    if (!b.success) return bad(reply, b.error);
    try {
      if (b.data.discard) discardReel(dd, b.data.date, b.data.idea, b.data.note); else rejectReel(dd, b.data.date, b.data.idea, b.data.note);
      return dailyView(dd, b.data.date);
    } catch (e) { return fail(reply, e); }
  });

  // The list and "seen" of notifications are global (routes/brands.ts); a test notification is made for the current brand.
  app.post("/notifications/test", async (req) => {
    const b = scope(req);
    return deps(b).notes.add({ kind: "test", brand: b.slug, title: `TEST: Reel Hub notification (${b.brand.name})`, body: "This is a test notification. Nothing was created.", url: `/#/${b.slug}/daily` });
  });
}
