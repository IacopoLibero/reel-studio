import { createReadStream, existsSync, statSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { join } from "node:path";
import { countPngs, listMoves, moveDir } from "../character/gallery.js";
import { folderOfKey, readScheduled, reelDirOf, resolveReelFile, scanReels } from "../reels/scanner.js";
import { readReelDetail } from "../reels/detail.js";
import { appendMessage, readChat } from "../reels/chat.js";
import { listVersions, restoreVersion } from "../reels/versions.js";
import { readCarouselDetail, resolveCarouselFile, scanCarousels } from "../carousels/scanner.js";
import { parseRange } from "./range.js";
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

  app.get("/reels", async (req) => { const b = scope(req); return scanReels(b.paths.reelsDir, b.slug, readScheduled(b.paths.scheduledFile), activeReels(b.slug)); });

  // Carousels: the list, one carousel with its caption and plan, and its slides (PNG) and caption as files.
  app.get("/carousels", async (req) => { const b = scope(req); return scanCarousels(b.paths.carouselsDir, b.slug); });
  app.get<{ Querystring: { folder?: string; name?: string } }>("/carousels/file", async (req, reply) => {
    const b = scope(req);
    const q = z.object({ folder: z.string(), name: z.string() }).safeParse(req.query);
    const file = q.success ? resolveCarouselFile(b.paths.carouselsDir, q.data.folder, q.data.name) : null;
    if (!q.success || !file) return reply.code(404).send({ error: "File not found." });
    const isPng = file.endsWith(".png");
    return reply.type(isPng ? "image/png" : "text/markdown; charset=utf-8").header("Cache-Control", "private, no-cache").header("Content-Length", statSync(file).size)
      .header("Content-Disposition", `${isPng ? "inline" : "attachment"}; filename="${q.data.name}"`).send(createReadStream(file));
  });
  app.get<{ Params: { folder: string } }>("/carousels/:folder", async (req, reply) => {
    const b = scope(req);
    const c = readCarouselDetail(b.paths.carouselsDir, req.params.folder, b.slug);
    if (!c) return reply.code(404).send({ error: "Carousel not found." });
    const busy = d.store.list().some((j) => j.type === "carousel.make" && j.brand === b.slug && j.params.rerunFolder === req.params.folder && (j.status === "queued" || j.status === "running"));
    return { carousel: c, busy };
  });

  app.get<{ Querystring: { key?: string; kind?: string } }>("/reels/file", async (req, reply) => {
    const b = scope(req);
    const q = z.object({ key: z.string(), kind: z.enum(["cover", "mp4"]) }).safeParse(req.query);
    // The key is <brand>/<folder>: another brand's files are never served through this brand's route.
    const file = q.success && q.data.key.startsWith(`${b.slug}/`) ? resolveReelFile(b.paths.reelsDir, folderOfKey(q.data.key), q.data.kind) : null;
    if (!q.success || !file) return reply.code(404).send({ error: "File not found." });
    const size = statSync(file).size;
    const type = q.data.kind === "cover" ? "image/png" : "video/mp4";
    reply.type(type).header("Accept-Ranges", "bytes").header("Cache-Control", "private, no-cache");
    // A video player seeks with Range requests: answer them with just the bytes asked for.
    const range = q.data.kind === "mp4" ? parseRange(req.headers.range, size) : null;
    if (range === "unsatisfiable") return reply.code(416).header("Content-Range", `bytes */${size}`).send();
    if (range) return reply.code(206).header("Content-Range", `bytes ${range.start}-${range.end}/${size}`).header("Content-Length", range.end - range.start + 1).send(createReadStream(file, { start: range.start, end: range.end }));
    return reply.header("Content-Length", size).send(createReadStream(file));
  });

  // One reel with everything its page shows: files, caption, script, plan, the conversation about it, and whether a change is running.
  app.get<{ Params: { folder: string } }>("/reels/:folder", async (req, reply) => {
    const b = scope(req);
    const reel = readReelDetail(b.paths.reelsDir, req.params.folder, b.slug, readScheduled(b.paths.scheduledFile));
    if (!reel) return reply.code(404).send({ error: "Reel not found." });
    const busy = d.store.list().some((j) => j.type === "reel.edit" && j.brand === b.slug && j.params.folder === req.params.folder && (j.status === "queued" || j.status === "running"));
    const dir = reelDirOf(b.paths.reelsDir, req.params.folder);
    return { reel, chat: readChat(dir), busy, versions: listVersions(dir) };
  });

  // Undo: puts a saved version of the reel back. Not while a change or a schedule of this reel is running.
  app.post<{ Params: { folder: string } }>("/reels/:folder/restore", async (req, reply) => {
    const b = scope(req);
    if (!readReelDetail(b.paths.reelsDir, req.params.folder, b.slug, {})) return reply.code(404).send({ error: "Reel not found." });
    const body = z.object({ version: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/, "That is not a version name.") }).safeParse(req.body);
    if (!body.success) throw new HttpError(400, body.error.issues[0]?.message ?? "Name the version to restore.");
    const key = `${b.slug}/${req.params.folder}`;
    const busy = d.store.list().some((j) => j.brand === b.slug && (j.status === "queued" || j.status === "running") && ((j.type === "reel.edit" && j.params.folder === req.params.folder) || (j.type === "instagram.schedule" && j.params.reel === key)));
    if (busy) throw new HttpError(409, "A change or a schedule of this reel is running. Try again when it is done.");
    const dir = reelDirOf(b.paths.reelsDir, req.params.folder);
    if (!listVersions(dir).some((v) => v.name === body.data.version)) return reply.code(404).send({ error: "That version was not found." });
    restoreVersion(dir, body.data.version);
    appendMessage(dir, { role: "claude", text: `Restored the version of ${body.data.version.replace(/T(\d{2})-(\d{2}).*/, " $1:$2")}. The reel as it was just before is saved too, so you can undo this.`, jobId: `restore-${Date.now()}` });
    return { restored: body.data.version };
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

  // The character of the brand (brand/<slug>/mascot/: <id>.py and the rendered movements/<move>/ frames): 404 for a brand without one.
  const characterOf = (b: ReturnType<Scope>) => {
    if (!b.brand.character.enabled) throw new HttpError(404, "This brand has no character.");
    return { ...b.brand.character, mascotDir: b.paths.mascotDir };
  };

  app.get("/character", async (req) => { const c = characterOf(scope(req)); return listMoves(c.mascotDir, c.id); });

  app.get<{ Params: { move: string; file: string } }>("/character/:move/frame/:file", async (req, reply) => {
    const c = characterOf(scope(req));
    const { move, file } = req.params;
    const path = join(moveDir(c.mascotDir, move), file);
    if (!validMoveName(move) || !/^[fo]-\d{4}\.png$/.test(file) || !existsSync(path)) return reply.code(404).send({ error: "Frame not found." });
    return reply.type("image/png").header("Cache-Control", "private, max-age=60").send(createReadStream(path));
  });

  app.get<{ Params: { move: string } }>("/character/:move", async (req, reply) => {
    const c = characterOf(scope(req));
    if (!validMoveName(req.params.move)) return reply.code(400).send({ error: "Invalid move name." });
    return { images: countPngs(moveDir(c.mascotDir, req.params.move)) };
  });

  app.get("/factory/questions", async (req) => { const b = scope(req); return listFactoryQuestions(b.slug, b.paths.dataDir, d.settings.get(b.slug), d.store.list()); });

  app.get("/settings", async (req) => d.settings.get(scope(req).slug));
  app.put("/settings", async (req, reply) => {
    const b = scope(req);
    const p = settingsSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message ?? "Invalid settings." });
    // The Instagram account name lives in brand.json, the rest in the settings files.
    const fresh = readBrand(d.config.dataDir, b.slug);
    if (fresh && fresh.instagram.account !== p.data.accountName) writeBrand(d.config.dataDir, { ...fresh, instagram: { ...fresh.instagram, account: p.data.accountName } });
    return d.settings.set(p.data, b.slug);
  });
}
