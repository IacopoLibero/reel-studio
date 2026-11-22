import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ModelRow, PlanSummary, ProviderList } from "../setup/voice-catalog.js";
import { HttpError } from "./scope.js";

/** The part of the VoiceStudio client the routes use (so tests can replace it). */
export interface VoiceApi {
  catalog(): Promise<ModelRow[]>;
  providers(): Promise<ProviderList>;
  installStatus(): Promise<unknown>;
  prepare(repoId: string): Promise<PlanSummary>;
  commit(a: { planId: string; planDigest: string; documentIds: string[] }): Promise<unknown>;
  setProvider(id: string, apiKey?: string): Promise<void>;
}

const repoId = z.string().regex(/^[A-Za-z0-9][\w.-]*\/[\w.-]+$/, "That is not a model name (owner/name).").max(200);
const planBody = z.object({ repoId });
const installBody = z.object({
  planId: z.string().regex(/^[a-f0-9]{32}$/), planDigest: z.string().regex(/^[a-f0-9]{64}$/),
  documentIds: z.array(z.string().max(200)).max(100),
  /** The person ticked "I acknowledge" on the screen. Nothing downloads without it. */
  acknowledged: z.literal(true, { error: "Tick the box to confirm you read the notices." }),
});
const llmBody = z.object({ provider: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/), apiKey: z.string().max(500).optional() });

const bad = (e: z.ZodError): HttpError => new HttpError(400, e.issues[0]?.message ?? "Invalid request.");

/** Choosing and downloading VoiceStudio's models, and its language model, from the setup screen. */
export function setupVoiceRoutes(app: FastifyInstance, voice: () => VoiceApi): void {
  app.get("/api/setup/voice", async () => {
    const v = voice();
    try {
      const [models, llm, status] = await Promise.all([v.catalog(), v.providers(), v.installStatus().catch(() => null)]);
      return { running: true, models, llm, status };
    } catch (e) {
      return { running: false, message: e instanceof Error ? e.message : String(e), models: [], llm: { active: "off", providers: [] }, status: null };
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
    await voice().commit({ planId: p.data.planId, planDigest: p.data.planDigest, documentIds: p.data.documentIds });
    return { started: true };
  });

  app.put("/api/setup/voice/llm", async (req) => {
    const p = llmBody.safeParse(req.body);
    if (!p.success) throw bad(p.error);
    await voice().setProvider(p.data.provider, p.data.apiKey);
    return { provider: p.data.provider };
  });
}
