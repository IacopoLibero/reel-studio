import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { FileError } from "../creator/files.js";
import { listPreviews, PREVIEW_FILE, patchState, readPlan, readState, saveSheet, sheetFile, studioDir } from "../creator/studio.js";
import type { AppDeps } from "../app.js";
import { acceptRawUploads } from "./creator.js";
import { HttpError, type Scope } from "./scope.js";

const fieldsBody = z.object({
  name: z.string().trim().max(80),
  fields: z.object({ what: z.string().max(500), personality: z.string().max(500), extra: z.string().max(500) }),
});

/** The character studio of one brand (characters/<slug>/): the reference sheet, the fields of the AI prompt, the previews of character.build and their approval. */
export function studioRoutes(app: FastifyInstance, d: AppDeps, scope: Scope): void {
  const root = d.config.root;
  const view = (slug: string) => ({ state: readState(root, slug), sheet: sheetFile(root, slug), previews: listPreviews(root, slug), plan: readPlan(root, slug) });

  app.get("/character/studio", async (req) => view(scope(req).slug));

  app.put("/character/studio/fields", async (req) => {
    const b = scope(req);
    const p = fieldsBody.safeParse(req.body);
    if (!p.success) throw new HttpError(400, p.error.issues[0]?.message ?? "Invalid fields.");
    patchState(root, b.slug, p.data);
    return view(b.slug);
  });

  app.register(async (up) => {
    acceptRawUploads(up);
    up.put("/character/studio/sheet", async (req) => {
      const b = scope(req);
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, "Send the picture as the request body.");
      try { saveSheet(root, b.slug, req.body); } catch (e) { if (e instanceof FileError) throw new HttpError(400, e.message); throw e; }
      patchState(root, b.slug, { status: "draft" });
      return view(b.slug);
    });
  });

  app.get("/character/studio/sheet", async (req, reply) => {
    const b = scope(req);
    const f = sheetFile(root, b.slug);
    if (!f) return reply.code(404).send({ error: "No reference sheet yet." });
    return reply.type(f.endsWith(".png") ? "image/png" : "image/jpeg").header("Cache-Control", "no-cache").send(createReadStream(join(studioDir(root, b.slug), f)));
  });

  app.get<{ Params: { file: string } }>("/character/studio/previews/:file", async (req, reply) => {
    const b = scope(req);
    const path = join(studioDir(root, b.slug), "previews", req.params.file);
    if (!PREVIEW_FILE.test(req.params.file) || !existsSync(path)) return reply.code(404).send({ error: "Preview not found." });
    return reply.type("image/png").header("Cache-Control", "no-cache").send(createReadStream(path));
  });

  app.post("/character/studio/approve", async (req) => {
    const b = scope(req);
    if (listPreviews(root, b.slug).length === 0) throw new HttpError(409, "There is no preview to approve yet.");
    patchState(root, b.slug, { status: "approved" });
    return view(b.slug);
  });
}
