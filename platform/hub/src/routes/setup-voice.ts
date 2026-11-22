import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ModelRow, PlanSummary } from "../setup/voice-catalog.js";
import { engineOfRepo, type EngineList } from "../setup/voice-engines.js";
import { HttpError } from "./scope.js";

/** The part of the VoiceStudio client the routes use (so tests can replace it). */
export interface VoiceApi {
  catalog(): Promise<ModelRow[]>;
  installStatus(): Promise<unknown>;
  prepare(repoId: string): Promise<PlanSummary>;
  install(repoId: string): Promise<unknown>;
  engines(): Promise<EngineList>;
  selectEngine(id: string): Promise<void>;
  remove(repoId: string): Promise<void>;
  cancel(repoId: string): Promise<void>;
}

const repoId = z.string().regex(/^[A-Za-z0-9][\w.-]*\/[\w.-]+$/, "That is not a model name (owner/name).").max(200);
const planBody = z.object({ repoId });
const installBody = z.object({
  repoId,
  /** The person read the licence on the screen and ticked the box. Nothing downloads without it. */
  acknowledged: z.literal(true, { error: "Tick the box to confirm you read the licence." }),
});

const engineBody = z.object({ engine: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/, "That is not a voice engine.") });
const repoBody = z.object({ repoId });

const bad = (e: z.ZodError): HttpError => new HttpError(400, e.issues[0]?.message ?? "Invalid request.");

/** Choosing and downloading VoiceStudio's voice models from the setup screen. */
export function setupVoiceRoutes(app: FastifyInstance, voice: () => VoiceApi): void {
  app.get("/api/setup/voice", async () => {
    const v = voice();
    try {
      const [models, status, eng] = await Promise.all([v.catalog(), v.installStatus().catch(() => null), v.engines()]);
      return { running: true, models: models.map((m) => ({ ...m, engine: engineOfRepo(m.repoId) })), status, active: eng.active, engines: eng.engines };
    } catch (e) {
      return { running: false, message: e instanceof Error ? e.message : String(e), models: [], status: null, active: "", engines: [] };
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

  /** The voice VoiceStudio uses for reels. Only an engine VoiceStudio says it can use now. */
  app.post("/api/setup/voice/select", async (req) => {
    const p = engineBody.safeParse(req.body);
    if (!p.success) throw bad(p.error);
    const e = (await voice().engines()).engines.find((x) => x.id === p.data.engine);
    if (!e?.available) throw new HttpError(409, `VoiceStudio cannot use that voice yet${e?.reason ? `: ${e.reason.replace(/\.+$/, "")}` : ""}. Its model may need to be downloaded, or the voice needs more than the model to run.`);
    await voice().selectEngine(p.data.engine);
    return { active: p.data.engine };
  });

  /** Deletes a downloaded model. The voice in use is kept: choose another voice first. */
  app.post("/api/setup/voice/remove", async (req) => {
    const p = repoBody.safeParse(req.body);
    if (!p.success) throw bad(p.error);
    const engine = engineOfRepo(p.data.repoId);
    if (engine && engine === (await voice().engines()).active) throw new HttpError(409, "That model is the voice in use. Choose another voice first, then remove it.");
    await voice().remove(p.data.repoId);
    return { removed: p.data.repoId };
  });

  app.post("/api/setup/voice/cancel", async (req) => {
    const p = repoBody.safeParse(req.body);
    if (!p.success) throw bad(p.error);
    await voice().cancel(p.data.repoId);
    return { cancelled: p.data.repoId };
  });
}
