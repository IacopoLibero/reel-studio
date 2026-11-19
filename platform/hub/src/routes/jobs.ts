import type { FastifyInstance } from "fastify";
import { buildSpec, createSchema, JobRequestError } from "../jobs/create.js";
import { brandCtx } from "../brands/context.js";
import type { AppDeps } from "../app.js";
import { HttpError, type Scope } from "./scope.js";

/** Not scoped to a brand: the whole queue (the hub is one queue for every brand), one job, cancel, and the live event stream. */
export function globalJobRoutes(app: FastifyInstance, d: AppDeps): void {
  app.get("/api/jobs", async () => d.store.list());

  app.get<{ Params: { id: string } }>("/api/jobs/:id", async (req, reply) => {
    const job = d.store.get(req.params.id);
    return job ?? reply.code(404).send({ error: "Job not found." });
  });

  app.post<{ Params: { id: string } }>("/api/jobs/:id/cancel", async (req, reply) => {
    try { return d.runner.cancel(req.params.id); } catch { return reply.code(404).send({ error: "Job not found." }); }
  });

  app.get("/api/events", (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send("hello", { ok: true });
    const off = d.store.onChange((j) => send("job", j));
    const ping = setInterval(() => res.write(": ping\n\n"), 20000);
    req.raw.on("close", () => { off(); clearInterval(ping); });
  });
}

/** Brand-scoped: the brand's jobs, and creating a job for the brand. `legacy` = the old /api/jobs path (its list is the global one above). */
export function brandJobRoutes(app: FastifyInstance, d: AppDeps, scope: Scope, legacy: boolean): void {
  if (!legacy) app.get("/jobs", async (req) => { const b = scope(req); return d.store.list().filter((j) => j.brand === b.slug); });

  app.post("/jobs", async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request." });
    // Old clients named the brand inside the params of an ideas or insights job.
    const named = legacy ? (req.body as { params?: { brand?: unknown } } | null)?.params?.brand : undefined;
    const b = typeof named === "string" ? brandCtx(d.brands, named) : scope(req);
    if (!b) throw new HttpError(404, "That brand does not exist.");
    try {
      const spec = buildSpec(parsed.data, { root: d.config.root, brand: b, settings: d.settings.get(b.slug), jobs: d.store.list() });
      const job = d.store.create(spec);
      d.runner.enqueue(job);
      return reply.code(201).send(job);
    } catch (e) {
      if (e instanceof JobRequestError) return reply.code(409).send({ error: e.message });
      throw e;
    }
  });
}
