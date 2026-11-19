import { createReadStream, existsSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { join } from "node:path";
import { countPngs, listMoves, moveDir } from "../character/gallery.js";
import { readScheduled, resolveReelFile, scanReels } from "../reels/scanner.js";
import { nextSlots } from "../slots.js";
import { settingsSchema } from "../settings.js";
import { validMoveName } from "../character/moves-parser.js";
import { loadScheduler, targetOf } from "../scheduler-bridge.js";
import { listFactoryQuestions } from "../factory/service.js";
import { readBrand, writeBrand } from "../brands/registry.js";
import type { AppDeps } from "../app.js";
import { HttpError, type Scope } from "./scope.js";

export function contentRoutes(app: FastifyInstance, d: AppDeps, scope: Scope): void {
  const activeReels = (slug: string) => new Set(d.store.list().filter((j) => j.type === "instagram.schedule" && j.brand === slug && (j.status === "queued" || j.status === "running")).map((j) => String(j.params.reel)));

  app.get("/reels", async (req) => { const b = scope(req); return scanReels(d.config.root, readScheduled(b.paths.scheduledFile), activeReels(b.slug), b.slug); });

  app.get<{ Querystring: { key?: string; kind?: string } }>("/reels/file", async (req, reply) => {
    const b = scope(req);
    const q = z.object({ key: z.string(), kind: z.enum(["cover", "mp4"]) }).safeParse(req.query);
    // The key is <brand>/<folder>: another brand's files are never served through this brand's route.
    const file = q.success && q.data.key.startsWith(`${b.slug}/`) ? resolveReelFile(d.config.root, q.data.key, q.data.kind) : null;
    if (!q.success || !file) return reply.code(404).send({ error: "File not found." });
    return reply.type(q.data.kind === "cover" ? "image/png" : "video/mp4").send(createReadStream(file));
  });

  app.get<{ Querystring: { count?: string } }>("/slots", async (req) => {
    const b = scope(req);
    const count = Math.min(60, Math.max(1, Number(req.query.count) || 14));
    const taken = new Set<string>(Object.values(readScheduled(b.paths.scheduledFile)).map((e) => e.at));
    for (const j of d.store.list()) if (j.type === "instagram.schedule" && j.brand === b.slug && (j.status === "queued" || j.status === "running")) taken.add(`${j.params.date} ${j.params.time}`);
    return nextSlots(d.settings.get(b.slug).slotPattern, new Date(), count, { taken });
  });

  // Checking the session opens a page in the scheduler's browser, so keep the answer for a minute per brand unless asked to refresh.
  const cached = new Map<string, { at: number; status: Record<string, unknown> }>();
  app.get<{ Querystring: { fresh?: string } }>("/instagram", async (req) => {
    const b = scope(req);
    const sched = await loadScheduler();
    const hit = cached.get(b.slug);
    if (!hit || req.query.fresh === "1" || Date.now() - hit.at > 60_000) {
      const status = await sched.getSessionStatus(targetOf(b)).catch((e: Error) => ({ loggedIn: false, state: "error", message: e.message }));
      cached.set(b.slug, { at: Date.now(), status });
    }
    const status = (cached.get(b.slug) as { status: Record<string, unknown> }).status;
    const queue = d.store.list().filter((j) => j.type === "instagram.schedule" && j.brand === b.slug && (j.status === "queued" || j.status === "running"));
    return { status, stub: sched.stub, queue, scheduled: readScheduled(b.paths.scheduledFile), account: b.brand.instagram.account, brand: { slug: b.slug, name: b.brand.name } };
  });

  app.post("/instagram/login-window", async (req, reply) => {
    const b = scope(req);
    const sched = await loadScheduler();
    cached.delete(b.slug);
    try { return (await sched.openLoginWindow(targetOf(b))) ?? { opened: true, account: b.brand.instagram.account }; } catch (e) { return reply.code(502).send({ error: (e as Error).message }); }
  });

  // The character of the brand (public/mascot/<move>/ frames and mascot/<id>.py): 404 for a brand without one.
  const characterOf = (b: ReturnType<Scope>) => {
    if (!b.brand.character.enabled) throw new HttpError(404, "This brand has no character.");
    return b.brand.character;
  };

  app.get("/character", async (req) => { const c = characterOf(scope(req)); return listMoves(d.config.root, c.id); });

  app.get<{ Params: { move: string; file: string } }>("/character/:move/frame/:file", async (req, reply) => {
    characterOf(scope(req));
    const { move, file } = req.params;
    const path = join(moveDir(d.config.root, move), file);
    if (!validMoveName(move) || !/^[fo]-\d{4}\.png$/.test(file) || !existsSync(path)) return reply.code(404).send({ error: "Frame not found." });
    return reply.type("image/png").header("Cache-Control", "private, max-age=60").send(createReadStream(path));
  });

  app.get<{ Params: { move: string } }>("/character/:move", async (req, reply) => {
    characterOf(scope(req));
    if (!validMoveName(req.params.move)) return reply.code(400).send({ error: "Invalid move name." });
    return { images: countPngs(moveDir(d.config.root, req.params.move)) };
  });

  app.get("/factory/questions", async (req) => { const b = scope(req); return listFactoryQuestions(d.config.root, b.slug, b.paths.dataDir, d.settings.get(b.slug), d.store.list()); });

  app.get("/settings", async (req) => d.settings.get(scope(req).slug));
  app.put("/settings", async (req, reply) => {
    const b = scope(req);
    const p = settingsSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message ?? "Invalid settings." });
    // The Instagram account name lives in brand.json, the rest in the settings files.
    const fresh = readBrand(d.config.root, b.slug);
    if (fresh && fresh.instagram.account !== p.data.accountName) writeBrand(d.config.root, { ...fresh, instagram: { ...fresh.instagram, account: p.data.accountName } });
    return d.settings.set(p.data, b.slug);
  });
}
