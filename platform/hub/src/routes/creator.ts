import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { bundleDir, BundleError, inspectBundle, normalizeBundle, stageBundle } from "../creator/bundle.js";
import { assembleBrand } from "../creator/create-job.js";
import { DeleteError, trashBrand } from "../creator/delete.js";
import { runAssistant, scratchDir } from "../creator/assistant.js";
import { checkFont, loadFontList } from "../creator/fonts.js";
import { FileError, LIMITS, MB, type UploadKind } from "../creator/files.js";
import { interviewTurn, turnRequestSchema } from "../creator/interview.js";
import { CREATE_STEPS, createRequestSchema } from "../creator/request.js";
import { VOICE_STEPS, voiceParamsSchema } from "../creator/voice-job.js";
import { UPLOAD_ID } from "../creator/uploads.js";
import { readZip, ZipError } from "../creator/zip.js";
import type { CreatorServices } from "../creator/services.js";
import { validateBrand } from "../brands/schema.js";
import { findCharacter, listCharacters } from "../character/gallery.js";
import { brandsDirOf } from "../brands/paths.js";
import { BrandError } from "../brands/registry.js";
import type { AppDeps } from "../app.js";
import { HttpError, makeScope } from "./scope.js";

const KINDS: readonly UploadKind[] = ["logo", "voice", "sheet"];
const raw = (limit: number) => ({ parseAs: "buffer" as const, bodyLimit: limit });

/** Registers the octet-stream parser for uploads (the browser sends the file as the request body). Call inside the plugin that holds the upload routes. */
export function acceptRawUploads(app: FastifyInstance): void {
  app.addContentTypeParser("application/octet-stream", raw(30 * MB), (_req, body, done) => done(null, body));
}

const asBuffer = (b: unknown): Buffer => { if (!Buffer.isBuffer(b) || b.length === 0) throw new HttpError(400, "Send the file as the request body (application/octet-stream)."); return b; };
const fail = (e: unknown): never => {
  if (e instanceof FileError || e instanceof BundleError || e instanceof ZipError || e instanceof BrandError || e instanceof DeleteError) throw new HttpError(e instanceof DeleteError ? e.status : 400, e.message);
  throw e;
};

const folderBody = z.object({ files: z.array(z.object({ path: z.string().max(300), data: z.string().max(40_000_000) })).min(1).max(400) });

/** The brand creator: uploads, import, the interview, creating a brand (one brand.create job) and deleting one (to the trash). */
export function creatorRoutes(app: FastifyInstance, d: AppDeps, svc: CreatorServices): void {
  const prefix = "/api/brand-creator";
  // The characters that exist on this machine (any brand's mascot/<id>.py); one id once, even when two brands have it.
  const mascots = (): string[] => [...new Set(listCharacters(brandsDirOf(d.config.dataDir)).map((c) => c.id))].sort();

  app.get(`${prefix}/options`, async () => {
    const a = d.settings.getGlobal().assistant;
    return {
      assistant: { ...a, tested: a.kind === "claude" },
      slugs: d.brands.slugs(),
      voices: d.brands.list().filter((b) => b.voice.sample && b.voice.sampleText).map((b) => ({ slug: b.slug, name: b.name })),
      characters: mascots(),
    };
  });

  app.get(`${prefix}/fonts`, async () => loadFontList(undefined, [d.config.root]));

  app.post(`${prefix}/validate`, async (req) => {
    const body = z.object({ brand: z.record(z.string(), z.unknown()) }).safeParse(req.body);
    if (!body.success) throw new HttpError(400, "Send {brand: {...}}.");
    const v = validateBrand(body.data.brand);
    const errors = v.ok ? [] : v.errors;
    if (v.ok) {
      const fonts = await loadFontList(undefined, [d.config.root]);
      for (const [k, name] of Object.entries(v.brand.fonts)) if (!checkFont(fonts, name).ok) errors.push(`fonts.${k}: "${name}" is not a Google font that Remotion can load.`);
      if (d.brands.has(v.brand.slug)) errors.push(`slug: the brand "${v.brand.slug}" already exists.`);
    }
    return { ok: errors.length === 0, errors };
  });

  app.register(async (up) => {
    acceptRawUploads(up);
    up.post<{ Params: { kind: string } }>(`${prefix}/uploads/:kind`, async (req) => {
      const kind = req.params.kind as UploadKind;
      if (!KINDS.includes(kind)) throw new HttpError(404, "Unknown upload type.");
      try { const s = svc.uploads.put(kind, asBuffer(req.body)); return { id: s.id, size: s.size, ext: s.ext }; } catch (e) { return fail(e); }
    });
    up.post(`${prefix}/import/zip`, async (req) => {
      try {
        const buf = asBuffer(req.body);
        if (buf.length > LIMITS.zip) throw new FileError(`The zip is too big: the limit is ${LIMITS.zip / MB} MB.`);
        return stageImport(readZip(buf).map((e) => ({ path: e.name, data: e.data })));
      } catch (e) { return fail(e); }
    });
  });

  const stageImport = (files: { path: string; data: Buffer }[]) => {
    const { preview, kept } = inspectBundle(normalizeBundle(files), { takenSlugs: d.brands.slugs(), hasMascot: (id) => findCharacter(brandsDirOf(d.config.dataDir), id) !== null });
    return { importId: stageBundle(svc.uploads.dir, kept), preview };
  };

  app.post(`${prefix}/import/folder`, { bodyLimit: 60 * MB }, async (req) => {
    const b = folderBody.safeParse(req.body);
    if (!b.success) throw new HttpError(400, "Send {files: [{path, data}]} with the file contents in base64.");
    try { return stageImport(b.data.files.map((f) => ({ path: f.path, data: Buffer.from(f.data, "base64") }))); } catch (e) { return fail(e); }
  });

  let interviewing = false;
  app.post(`${prefix}/interview`, async (req) => {
    const body = turnRequestSchema.safeParse(req.body);
    if (!body.success) throw new HttpError(400, body.error.issues[0]?.message ?? "Invalid conversation.");
    if (interviewing) throw new HttpError(409, "The assistant is still answering. Wait a moment.");
    interviewing = true;
    try {
      const g = d.settings.getGlobal();
      return await interviewTurn(body.data.messages, {
        takenSlugs: d.brands.slugs(),
        run: (prompt) => runAssistant({ config: g.assistant, claudeBin: d.config.claudeBin, model: g.claudeModel, prompt, root: d.config.root, scratch: scratchDir(d.config.dataDir), dataDir: d.config.dataDir, env: process.env }),
      });
    } catch (e) {
      throw new HttpError(424, `The assistant could not answer: ${(e as Error).message}`);
    } finally { interviewing = false; }
  });

  /** The voice step: the assistant proposes voices for the brand typed so far and VoiceStudio makes each one. The job's result lists them as staged uploads. */
  app.post(`${prefix}/voices`, async (req, reply) => {
    const p = voiceParamsSchema.safeParse(req.body);
    if (!p.success) throw new HttpError(400, `${p.error.issues[0]?.path.join(".") || "request"}: ${p.error.issues[0]?.message ?? "invalid"}`);
    const open = d.store.list().find((j) => j.type === "voice.generate" && (j.status === "queued" || j.status === "running"));
    if (open) return { job: open }; // one round at a time: a page that lost track of it picks it up again
    // the tag "new" is a reserved slug: no brand can ever own this job
    const job = d.store.create({ type: "voice.generate", brand: "new", title: `Voices for ${p.data.brand.name}`, steps: VOICE_STEPS, params: p.data });
    d.runner.enqueue(job);
    return reply.code(202).send({ job });
  });

  /** Plays a voice the step made (or a sample uploaded and not yet used). */
  app.get<{ Params: { id: string } }>(`${prefix}/uploads/voice/:id`, async (req, reply) => {
    if (!UPLOAD_ID.test(req.params.id)) throw new HttpError(404, "Not found.");
    const s = svc.uploads.get(req.params.id, "voice");
    if (!s) throw new HttpError(404, "That voice is gone. Make the voices again.");
    return reply.header("content-type", "audio/wav").header("cache-control", "private, max-age=3600").header("x-content-type-options", "nosniff").send(svc.uploads.read(req.params.id, "voice").data);
  });

  app.post("/api/brands", async (req, reply) => {
    const p = createRequestSchema.safeParse(req.body);
    if (!p.success) throw new HttpError(400, `${p.error.issues[0]?.path.join(".") || "request"}: ${p.error.issues[0]?.message ?? "invalid"}`);
    const r = p.data;
    try {
      const brand = assembleBrand(r, svc, false);
      if (d.brands.has(brand.slug)) throw new BrandError(`The brand "${brand.slug}" already exists. Choose another slug.`);
      if (d.store.list().some((j) => j.type === "brand.create" && j.brand === brand.slug && (j.status === "queued" || j.status === "running"))) throw new BrandError(`The brand "${brand.slug}" is already being created.`);
      const fonts = await loadFontList(undefined, [d.config.root]);
      for (const [k, name] of Object.entries(brand.fonts)) if (!checkFont(fonts, name).ok) throw new BrandError(`fonts.${k}: "${name}" is not a Google font that Remotion can load.`);
      for (const [id, kind] of [[r.logoUpload, "logo"], [r.character.sheetUpload, "sheet"], [r.voice.mode === "upload" ? r.voice.wavUpload : undefined, "voice"]] as const) if (id && !svc.uploads.get(id, kind)) throw new BrandError(`The uploaded ${kind} file is gone. Upload it again.`);
      if (r.importId && !bundleDir(svc.uploads.dir, r.importId)) throw new BrandError("The imported folder is gone. Import it again.");
      if (r.character.mode === "import" && !mascots().includes(r.character.id ?? "")) throw new BrandError(`There is no character "${r.character.id ?? ""}" on this machine.`);
      if (r.voice.mode === "reuse" && !d.brands.list().some((b) => b.slug === (r.voice as { from: string }).from && b.voice.sample && b.voice.sampleText)) throw new BrandError("That brand has no voice sample to reuse.");
      const job = d.store.create({
        type: "brand.create", brand: brand.slug, title: `Create brand: ${brand.name}`, steps: CREATE_STEPS,
        params: { ...r, brand: { ...r.brand, slug: brand.slug }, requestId: randomBytes(16).toString("hex") },
      });
      d.runner.enqueue(job);
      return reply.code(202).send({ job, slug: brand.slug });
    } catch (e) { return fail(e); }
  });

  const scope = makeScope(d);
  app.post<{ Params: { slug: string } }>("/api/brands/:slug/delete", async (req) => {
    const b = scope(req);
    const body = z.object({ confirm: z.string() }).safeParse(req.body);
    if (!body.success) throw new HttpError(400, "Send {confirm: slug}.");
    try { return trashBrand({ root: d.config.root, dataDir: d.config.dataDir, brands: d.brands, slug: b.slug, confirm: body.data.confirm, jobs: d.store.list() }); } catch (e) { return fail(e); }
  });
}
