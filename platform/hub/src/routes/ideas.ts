import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pendingView, resolveBatch } from "../ideas/service.js";
import { BATCH_ID, listBatches } from "../ideas/store.js";
import type { AppDeps } from "../app.js";
import type { Scope } from "./scope.js";

const resolveBody = z.object({
  batch: z.string().regex(BATCH_ID),
  accept: z.array(z.string().regex(/^[0-9a-f]{12}$/)).max(60).default([]),
  reject: z.array(z.string().regex(/^[0-9a-f]{12}$/)).max(60).default([]),
}).refine((b) => b.accept.length + b.reject.length > 0, "Choose Accept or Reject for at least one idea.");

export function ideasRoutes(app: FastifyInstance, d: AppDeps, scope: Scope): void {
  app.get("/factory/ideas", async (req) => { const b = scope(req); return pendingView(d.config.root, b.paths.dataDir, listBatches(b.paths.dataDir, 10)); });

  app.post("/factory/ideas/resolve", async (req, reply) => {
    const b = scope(req);
    const p = resolveBody.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message ?? "Invalid request." });
    const r = await resolveBatch(d.config.root, b.paths.dataDir, p.data.batch, p.data.accept, p.data.reject);
    return r ?? reply.code(404).send({ error: "That batch of ideas was not found." });
  });
}
