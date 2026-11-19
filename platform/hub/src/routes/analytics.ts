import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { analyticsView } from "../analytics/view.js";
import { readBestTimes } from "../analytics/store.js";
import { readBrandQuestions } from "../factory/service.js";
import { questionId } from "../factory/questions.js";
import { assignBody, seriesInput } from "../series/schema.js";
import { SeriesStore } from "../series/store.js";
import { defaultsFromPattern } from "../calendar/best-times.js";
import type { AppDeps } from "../app.js";
import type { Scope } from "./scope.js";

const idParam = z.object({ id: z.string().regex(/^[0-9a-f]{12}$/) });

export function analyticsRoutes(app: FastifyInstance, d: AppDeps, scope: Scope): void {
  const series = (req: Parameters<Scope>[0]) => new SeriesStore(scope(req).paths.seriesFile);
  const bad = (m?: string) => ({ error: m ?? "Invalid request." });

  app.get("/analytics", async (req) => analyticsView(scope(req).paths.dataDir));

  app.get("/calendar/suggestions", async (req) => readBestTimes(scope(req).paths.dataDir) ?? { at: null, enough: false, message: "No suggestion yet. Press Suggest best times.", reelsUsed: 0, basedOn: "", note: "", suggestions: [], defaults: defaultsFromPattern(d.settings.get(scope(req).slug).slotPattern) });

  app.get("/series", async (req) => ({
    series: series(req).list(),
    questions: readBrandQuestions(d.config.root, scope(req).slug).map((q) => ({ id: questionId(q.question), question: q.question, done: q.done, folder: q.folder })),
    badges: series(req).badges(),
  }));
  app.get("/series/badges", async (req) => series(req).badges());

  app.post("/series", async (req, reply) => {
    const b = seriesInput.safeParse(req.body);
    if (!b.success) return reply.code(400).send(bad(b.error.issues[0]?.message));
    return reply.code(201).send(series(req).create(b.data));
  });
  app.put("/series/:id", async (req, reply) => {
    const p = idParam.safeParse(req.params); const b = seriesInput.safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send(bad(b.success ? undefined : b.error.issues[0]?.message));
    return series(req).update(p.data.id, b.data) ?? reply.code(404).send(bad("Series not found."));
  });
  app.post("/series/:id/assign", async (req, reply) => {
    const p = idParam.safeParse(req.params); const b = assignBody.safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send(bad(b.success ? undefined : b.error.issues[0]?.message));
    return series(req).assign(p.data.id, b.data.questionIds) ?? reply.code(404).send(bad("Series not found."));
  });
  app.delete("/series/:id", async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send(bad());
    return series(req).remove(p.data.id) ? { ok: true } : reply.code(404).send(bad("Series not found."));
  });
}
