import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { runChecks, type CheckContext } from "../setup/checks.js";
import type { SetupInstaller } from "../setup/installer.js";
import { readSetup, writeSetup } from "../setup/state.js";
import { recommendMode, voiceMode, VOICE_MODES } from "../setup/voice-modes.js";
import { HttpError } from "./scope.js";

/** The steps the screen can start. */
export const INSTALL_STEPS = ["workspace-packages", "whisper", "remotion-skills", "blender", "voicestudio"] as const;

/** The first-run setup screen: what is installed, the voice mode, and the install steps the app runs itself. */
export function setupRoutes(app: FastifyInstance, d: AppDeps, installer: SetupInstaller, context: () => CheckContext): void {
  const dataDir = d.config.dataDir;
  app.get("/api/setup", async () => {
    const ctx = context();
    return {
      state: readSetup(dataDir),
      items: runChecks(ctx),
      modes: VOICE_MODES,
      recommended: recommendMode(ctx.gpu).id,
      steps: Object.fromEntries(INSTALL_STEPS.map((id) => [id, installer.status(id)])),
    };
  });

  app.put("/api/setup/voice-mode", async (req) => {
    const p = z.object({ id: z.string() }).safeParse(req.body);
    if (!p.success || !voiceMode(p.data.id)) throw new HttpError(400, "That voice mode does not exist.");
    const state = { ...readSetup(dataDir), voiceMode: p.data.id };
    writeSetup(dataDir, state);
    return state;
  });

  app.post<{ Params: { id: string } }>("/api/setup/steps/:id", async (req, reply) => {
    const id = req.params.id;
    if (!(INSTALL_STEPS as readonly string[]).includes(id)) throw new HttpError(400, "That install step does not exist.");
    const started = installer.start(id);
    return reply.code(started ? 202 : 200).send({ started, status: installer.status(id) });
  });

  app.post("/api/setup/complete", async () => {
    const missing = runChecks(context()).filter((i) => i.required && i.status === "missing").map((i) => i.label);
    if (missing.length) throw new HttpError(409, `Reel Studio still needs: ${missing.join(", ")}.`);
    const state = { ...readSetup(dataDir), completed: true };
    writeSetup(dataDir, state);
    return state;
  });
}
