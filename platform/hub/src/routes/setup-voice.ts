import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ModelRow, PlanSummary } from "../setup/voice-catalog.js";
import { HttpError } from "./scope.js";

/** The part of the VoiceStudio client the routes use (so tests can replace it). */
export interface VoiceApi {
  catalog(): Promise<ModelRow[]>;
  installStatus(): Promise<unknown>;
  prepare(repoId: string): Promise<PlanSummary>;
  install(repoId: string): Promise<unknown>;
}

const repoId = z.string().regex(/^[A-Za-z0-9][\w.-]*\/[\w.-]+$/, "That is not a model name (owner/name).").max(200);
const planBody = z.object({ repoId });
const installBody = z.object({
  repoId,
  /** The person read the licence on the screen and ticked the box. Nothing downloads without it. */
  acknowledged: z.literal(true, { error: "Tick the box to confirm you read the licence." }),
});

const bad = (e: z.ZodError): HttpError => new HttpError(400, e.issues[0]?.message ?? "Invalid request.");

/** Choosing and downloading VoiceStudio's voice models from the setup screen. */
export function setupVoiceRoutes(app: FastifyInstance, voice: () => VoiceApi): void {
  app.get("/api/setup/voice", async () => {
    const v = voice();
    try {
      const [models, status] = await Promise.all([v.catalog(), v.installStatus().catch(() => null)]);
      return { running: true, models, status };
    } catch (e) {
      return { running: false, message: e instanceof Error ? e.message : String(e), models: [], status: null };
    }
  });

  app.post("/api/setup/voice/plan", async (req) => {
    const p = planBody.safeParse(req.body);
    if (!p.success) throw bad(p.error);
    return voice().prepare(p.data.repoId);
  });

  app.post("/api/setup/voice/install", async (req) => {
    const p = installBody.safeParse(req.body);
    if (!p.success) throw bad(p.error);
    await voice().install(p.data.repoId);
    return { started: true };
  });

}
