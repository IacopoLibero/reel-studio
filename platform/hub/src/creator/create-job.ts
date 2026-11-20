import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { BrandError } from "../brands/registry.js";
import { uniqueSlug, validateBrand, type Brand } from "../brands/schema.js";
import type { Handler } from "../jobs/handlers.js";
import { bundleDir } from "./bundle.js";
import { CREATE_STEPS, createRequestSchema, type CreateRequest } from "./request.js";
import type { CreatorServices } from "./services.js";
import { saveSheet, studioDir, writeState, readState } from "./studio.js";
import { adaptStyle, emptyQuestions } from "./style.js";

const MARKER = ".created-by.json";
const MARKS = [0.05, 0.2, 0.5, 0.85, 1];

export const NEXT_STEPS = [
  "Log in to Instagram on this brand's Instagram page.",
  "Add your first questions to the Factory, or press \"Find ideas\".",
  "Make the first reel.",
];

const dedupe = (list: readonly string[]): string[] => {
  const seen = new Set<string>();
  return list.filter((k) => { const key = k.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });
};
/** Each keyword once; a word listed for both closings stays only in `product` (the classifier lets product win anyway). */
export function dedupeRules(r: { product: readonly string[]; general: readonly string[] }): { product: string[]; general: string[] } {
  const product = dedupe(r.product);
  const have = new Set(product.map((k) => k.toLowerCase()));
  return { product, general: dedupe(r.general).filter((k) => !have.has(k.toLowerCase())) };
}

interface Marker { requestId: string; summary?: Record<string, unknown> }
const readMarker = (dir: string): Marker | null => { try { return JSON.parse(readFileSync(join(dir, MARKER), "utf8")) as Marker; } catch { return null; } };

const inside = (base: string, p: string): boolean => { const r = relative(resolve(base), resolve(p)); return r !== "" && !r.startsWith("..") && !isAbsolute(r); };

function listFiles(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(join(dir, e.name), base) : [relative(base, join(dir, e.name))])).sort();
}

/** The brand as it will be written: the request's values with the pieces the creator decides (profile folder, voice paths, character) forced. */
export function assembleBrand(req: CreateRequest, svc: CreatorServices, voiceFiles: { sample: string; text: string } | null): Brand {
  const raw = { ...req.brand } as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name : "";
  const slug = typeof raw.slug === "string" && raw.slug ? raw.slug : uniqueSlug(name || "brand", svc.brands.slugs());
  const instagram = { ...((raw.instagram as object | undefined) ?? {}), profileDir: null };
  const voice = { ...((raw.voice as object | undefined) ?? {}), sample: voiceFiles?.sample ?? null, sampleText: voiceFiles?.text ?? null };
  const c = req.character;
  const character = c.mode === "none" && req.source === "import" ? raw.character
    : c.mode === "import" ? { enabled: true, id: c.id ?? "character", name: c.name }
    : { enabled: false, id: "character", name: c.mode === "create" ? c.name : "" };
  const v = validateBrand({ version: 1, ...raw, slug, instagram, voice, ...(character ? { character } : {}) });
  if (!v.ok) throw new BrandError(v.errors.join("; "));
  const blog = v.brand.sources.blogDir;
  if (blog && !isAbsolute(blog)) throw new BrandError("sources.blogDir: use a full folder path, such as /home/me/blog.");
  return v.brand;
}

function copyVoice(req: CreateRequest, svc: CreatorServices, staged: string | null): { sample: string; text: string; write: (voiceDir: string) => void } | null {
  const v = req.voice;
  if (v.mode === "upload") {
    const { data } = svc.uploads.read(v.wavUpload, "voice");
    return { sample: "voice/voice.wav", text: "voice/voice.txt", write: (d) => { writeFileSync(join(d, "voice.wav"), data); writeFileSync(join(d, "voice.txt"), `${v.text}\n`); } };
  }
  if (v.mode === "reuse") {
    const from = svc.brands.get(v.from);
    const dir = svc.brands.paths(v.from, from).brandDir;
    const wav = from?.voice.sample ? resolve(dir, from.voice.sample) : "";
    const txt = from?.voice.sampleText ? resolve(dir, from.voice.sampleText) : "";
    if (!from || !wav || !inside(dir, wav) || !existsSync(wav)) throw new BrandError(`The brand "${v.from}" has no voice sample to reuse.`);
    if (!txt || !inside(dir, txt) || !existsSync(txt)) throw new BrandError(`The brand "${v.from}" has no text for its voice sample.`);
    return { sample: "voice/voice.wav", text: "voice/voice.txt", write: (d) => { copyFileSync(wav, join(d, "voice.wav")); copyFileSync(txt, join(d, "voice.txt")); } };
  }
  const sample = typeof (req.brand.voice as { sample?: unknown } | undefined)?.sample === "string" ? String((req.brand.voice as { sample: string }).sample) : "";
  const text = typeof (req.brand.voice as { sampleText?: unknown } | undefined)?.sampleText === "string" ? String((req.brand.voice as { sampleText: string }).sampleText) : "";
  if (staged && sample && /^voice\/[A-Za-z0-9._-]+\.wav$/.test(sample) && existsSync(join(staged, sample))) {
    const hasText = /^voice\/[A-Za-z0-9._-]+\.txt$/.test(text) && existsSync(join(staged, text));
    return { sample, text: hasText ? text : "", write: (d) => { copyFileSync(join(staged, sample), join(d, basename(sample))); if (hasText) copyFileSync(join(staged, text), join(d, basename(text))); } };
  }
  return null;
}

/**
 * brand.create: the one job every entry of the New brand page ends in.
 * Validates, makes the folders with BrandRegistry.create, writes brand.json, style.md, the question list, the logo and voice files,
 * keeps a character reference sheet, registers the brand (the registry reads brand.json on demand), starts the daily loop only if asked.
 * Never overwrites a brand; a failure removes everything this run created; running the same request again returns the first summary.
 */
export const brandCreate: Handler = async (job, ctx) => {
  const svc = ctx.creator;
  if (!svc) throw new Error("The brand creator is not available in this hub.");
  const req = createRequestSchema.parse(job.params);
  const requestId = req.requestId ?? job.id.replace(/-/g, "");
  const step = (i: number, log?: string) => ctx.update({ step: CREATE_STEPS[i], stepIndex: i, progress: MARKS[i] as number, ...(log ? { log } : {}) });

  step(0, "Checking the brand");
  const stagedDir = req.importId ? bundleDir(svc.uploads.dir, req.importId) : null;
  if (req.importId && !stagedDir) throw new BrandError("The imported folder is gone. Import it again.");
  const voice = copyVoice(req, svc, stagedDir);
  const brand = assembleBrand(req, svc, voice ? { sample: voice.sample, text: voice.text } : null);
  if (brand.character.enabled && req.character.mode === "import" && !existsSync(join(svc.root, "mascot", `${brand.character.id}.py`))) throw new BrandError(`There is no character "${brand.character.id}" on this machine (mascot/${brand.character.id}.py).`);

  const p = svc.brands.paths(brand.slug, brand);
  const folders = [p.brandDir, p.reelsDir, p.dataDir, studioDir(svc.root, brand.slug)];
  if (svc.brands.has(brand.slug)) {
    const m = readMarker(p.dataDir);
    if (m?.requestId === requestId && m.summary) { step(4, "This request already created the brand."); return m.summary; }
    throw new BrandError(`The brand "${brand.slug}" already exists. Nothing was changed.`);
  }
  if (readMarker(p.dataDir)?.requestId === requestId) folders.forEach((f) => rmSync(f, { recursive: true, force: true })); // leftovers of a run that was cut off
  const busy = folders.find((f) => existsSync(f));
  if (busy) throw new BrandError(`The folder ${relative(svc.root, busy) || busy} already exists, so "${brand.slug}" cannot be created. Nothing was changed.`);

  const profileExisted = existsSync(p.profileDir);
  try {
    step(1, `Creating ${brand.slug}`);
    mkdirSync(p.dataDir, { recursive: true });
    writeFileSync(join(p.dataDir, MARKER), JSON.stringify({ requestId }));
    svc.brands.create(brand);

    step(2, "Writing brand.json, style.md and the other files");
    let logo: "png" | "svg" | null = null;
    const logoSource = req.logoUpload ? svc.uploads.read(req.logoUpload, "logo") : null;
    if (logoSource) { logo = logoSource.staged.ext === "svg" ? "svg" : "png"; }
    else if (stagedDir && existsSync(join(stagedDir, "logo.svg"))) logo = "svg";
    else if (stagedDir && existsSync(join(stagedDir, "logo.png"))) logo = "png";
    if (logo) {
      rmSync(p.logo, { force: true });
      const dest = join(p.brandDir, `logo.${logo}`);
      if (logoSource) writeFileSync(dest, logoSource.data); else copyFileSync(join(stagedDir as string, `logo.${logo}`), dest);
    }
    if (voice) { mkdirSync(p.voiceDir, { recursive: true }); voice.write(p.voiceDir); }

    const filled = readFileSync(p.styleMd, "utf8");
    const importedStyle = stagedDir && existsSync(join(stagedDir, "style.md")) ? readFileSync(join(stagedDir, "style.md"), "utf8") : null;
    const style = req.styleMd?.trim() ? req.styleMd : importedStyle ?? adaptStyle(filled, brand, { logo, voice: !!voice, ...(req.character.mode === "create" && req.character.fields?.what ? { mascot: req.character.fields.what } : {}) });
    writeFileSync(p.styleMd, `${style.trimEnd()}\n`);
    const importedQuestions = stagedDir && existsSync(join(stagedDir, "reel-questions.md")) ? readFileSync(join(stagedDir, "reel-questions.md"), "utf8") : null;
    writeFileSync(p.questionsMd, importedQuestions ?? emptyQuestions(readFileSync(p.questionsMd, "utf8"), brand.name));

    if (req.character.mode === "create") {
      writeState(svc.root, brand.slug, { ...readState(svc.root, brand.slug), name: req.character.name, ...(req.character.fields ? { fields: req.character.fields } : {}) });
    }
    const sheet = req.character.sheetUpload && req.character.mode !== "none" ? svc.uploads.read(req.character.sheetUpload, "sheet") : null;
    if (sheet) saveSheet(svc.root, brand.slug, sheet.data);

    step(3, "Registering the brand");
    if (!svc.brands.has(brand.slug)) throw new Error("The brand was written but cannot be read back. See brand.json.");
    const rules = req.closingRules && req.closingRules.product.length + req.closingRules.general.length > 0 ? dedupeRules(req.closingRules) : null; // empty boxes keep the settings defaults
    if (req.dailyLoop || rules) {
      const s = svc.settings.get(brand.slug);
      svc.settings.set({
        ...s,
        ...(rules ? { factory: { ...s.factory, closingRules: rules } } : {}),
        ...(req.dailyLoop ? { daily: { ...s.daily, enabled: true } } : {}),
      }, brand.slug);
      if (req.dailyLoop) svc.ensureDaily(brand.slug);
    }

    const summary = {
      slug: brand.slug, name: brand.name, source: req.source, daily: req.dailyLoop, logo, voice: voice ? voice.sample : null,
      character: req.character.mode, folders: [...folders, p.profileDir].map((f) => { const r = relative(svc.root, f); return r.startsWith("..") ? f : r; }),
      files: listFiles(p.brandDir).map((f) => `brand/${brand.slug}/${f}`), nextSteps: NEXT_STEPS,
    };
    writeFileSync(join(p.dataDir, MARKER), JSON.stringify({ requestId, summary }));
    for (const id of [req.logoUpload, voice && req.voice.mode === "upload" ? req.voice.wavUpload : undefined, req.character.sheetUpload, req.importId]) if (id) svc.uploads.remove(id);
    step(4, `Brand ${brand.slug} is ready`);
    return summary;
  } catch (e) {
    for (const f of folders) rmSync(f, { recursive: true, force: true });
    if (!profileExisted) rmSync(p.profileDir, { recursive: true, force: true });
    ctx.update({ log: "Rolled back: everything this run created was removed." });
    throw e;
  }
};
