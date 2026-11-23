import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { FileError } from "../creator/files.js";
import { readFileSync } from "node:fs";
import { runAssistant, scratchDir } from "../creator/assistant.js";
import { characterTurn, characterTurnRequestSchema } from "../creator/character-interview.js";
import { listPreviews, PREVIEW_FILE, patchState, readPlan, readState, saveSheet, sheetFile, studioDir } from "../creator/studio.js";
import type { AppDeps } from "../app.js";
import { acceptRawUploads } from "./creator.js";
import { HttpError, type Scope } from "./scope.js";

const fieldsBody = z.object({
  name: z.string().trim().max(80),
  fields: z.object({ what: z.string().max(1500), personality: z.string().max(1500), extra: z.string().max(1500) }),
});

/** The character studio of one brand (<brand>/mascot/studio/): the reference sheet, the fields of the AI prompt, the previews of character.build and their approval. */
export function studioRoutes(app: FastifyInstance, d: AppDeps, scope: Scope): void {
  const view = (brandDir: string) => ({ state: readState(brandDir), sheet: sheetFile(brandDir), previews: listPreviews(brandDir), plan: readPlan(brandDir) });

  app.get("/character/studio", async (req) => view(scope(req).paths.brandDir));

  /** The conversation about the character, for a brand that exists: the hub itself gives the assistant what is decided about the brand (brand.json, style.md) and what is already written. */
  let talking = false;
  app.post("/character/studio/chat", async (req) => {
    const b = scope(req);
    const body = characterTurnRequestSchema.pick({ messages: true }).safeParse(req.body);
    if (!body.success) throw new HttpError(400, body.error.issues[0]?.message ?? "Invalid conversation.");
    if (talking) throw new HttpError(409, "The assistant is still answering. Wait a moment.");
    talking = true;
    try {
      const x = b.brand;
      let styleMd = "";
      try { styleMd = readFileSync(b.paths.styleMd, "utf8").slice(0, 12_000); } catch { /* no style guide */ }
      const st = readState(b.paths.brandDir);
      const g = d.settings.getGlobal();
      const request = characterTurnRequestSchema.parse({
        messages: body.data.messages, current: { name: st.name || x.character.name, ...st.fields },
        brand: { name: x.name, about: x.about, audience: x.audience, tone: x.tone, language: x.language, website: x.website, colors: x.colors, fonts: x.fonts, styleMd },
      });
      return await characterTurn(request, (prompt) => runAssistant({ config: g.assistant, claudeBin: d.config.claudeBin, model: g.claudeModel, prompt, root: d.config.root, scratch: scratchDir(d.config.dataDir), dataDir: d.config.dataDir, env: process.env }));
    } catch (e) {
      throw new HttpError(424, `The assistant could not answer: ${(e as Error).message}`);
    } finally { talking = false; }
  });

  app.put("/character/studio/fields", async (req) => {
    const b = scope(req);
    const p = fieldsBody.safeParse(req.body);
    if (!p.success) throw new HttpError(400, p.error.issues[0]?.message ?? "Invalid fields.");
    patchState(b.paths.brandDir, p.data);
    return view(b.paths.brandDir);
  });

  app.register(async (up) => {
    acceptRawUploads(up);
    up.put("/character/studio/sheet", async (req) => {
      const b = scope(req);
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, "Send the picture as the request body.");
      try { saveSheet(b.paths.brandDir, req.body); } catch (e) { if (e instanceof FileError) throw new HttpError(400, e.message); throw e; }
      patchState(b.paths.brandDir, { status: "draft" });
      return view(b.paths.brandDir);
    });
  });

  app.get("/character/studio/sheet", async (req, reply) => {
    const b = scope(req);
    const f = sheetFile(b.paths.brandDir);
    if (!f) return reply.code(404).send({ error: "No reference sheet yet." });
    return reply.type(f.endsWith(".png") ? "image/png" : "image/jpeg").header("Cache-Control", "no-cache").send(createReadStream(join(studioDir(b.paths.brandDir), f)));
  });

  app.get<{ Params: { file: string } }>("/character/studio/previews/:file", async (req, reply) => {
    const b = scope(req);
    const path = join(studioDir(b.paths.brandDir), "previews", req.params.file);
    if (!PREVIEW_FILE.test(req.params.file) || !existsSync(path)) return reply.code(404).send({ error: "Preview not found." });
    return reply.type("image/png").header("Cache-Control", "no-cache").send(createReadStream(path));
  });

  app.post("/character/studio/approve", async (req) => {
    const b = scope(req);
    if (listPreviews(b.paths.brandDir).length === 0) throw new HttpError(409, "There is no preview to approve yet.");
    patchState(b.paths.brandDir, { status: "approved" });
    return view(b.paths.brandDir);
  });
}
