import { copyFileSync, constants as fsConstants, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { brandsDirOf, characterFiles, voiceRelPaths, voiceTarget, type BrandPaths, type VoiceTarget } from "../brands/paths.js";
import { BrandError } from "../brands/registry.js";
import { fillTemplate } from "../brands/template.js";
import { findCharacter, type FoundCharacter } from "../character/gallery.js";
import { uniqueSlug, validateBrand, type Brand } from "../brands/schema.js";
import type { Handler } from "../jobs/handlers.js";
import { bundleDir } from "./bundle.js";
import { CREATE_STEPS, createRequestSchema, type CreateRequest } from "./request.js";
import type { CreatorServices } from "./services.js";
import { saveSheet, writeState, readState } from "./studio.js";
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
export function assembleBrand(req: CreateRequest, svc: CreatorServices, hasVoice: boolean): Brand {
  const raw = { ...req.brand } as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name : "";
  const slug = typeof raw.slug === "string" && raw.slug ? raw.slug : uniqueSlug(name || "brand", svc.brands.slugs());
  const instagram = { ...((raw.instagram as object | undefined) ?? {}), profileDir: null };
  const c = req.character;
  const character = c.mode === "none" && req.source === "import" ? raw.character
    : c.mode === "import" ? { enabled: true, id: c.id ?? "character", name: c.name }
    : { enabled: false, id: "character", name: c.mode === "create" ? c.name : "" };
  // The voice sample sits with the character when the brand has one, else in identity/ (see voiceTarget).
  const own = character as { enabled?: unknown; id?: unknown } | undefined;
  const rel = voiceRelPaths({ enabled: own?.enabled === true, id: typeof own?.id === "string" ? own.id : "character" });
  const voice = { ...((raw.voice as object | undefined) ?? {}), sample: hasVoice ? rel.sample : null, sampleText: hasVoice ? rel.sampleText : null };
  const v = validateBrand({ version: 1, ...raw, slug, instagram, voice, ...(character ? { character } : {}) });
  if (!v.ok) throw new BrandError(v.errors.join("; "));
  const blog = v.brand.sources.blogDir;
  if (blog && !isAbsolute(blog)) throw new BrandError("sources.blogDir: use a full folder path, such as /home/me/blog.");
  return v.brand;
}

/** Where the voice sample of a request comes from. `write` stores it where the brand keeps its voice. */
interface VoiceSource { write: (t: VoiceTarget) => void }

function copyVoice(req: CreateRequest, svc: CreatorServices, staged: string | null): VoiceSource | null {
  const v = req.voice;
  if (v.mode === "upload") {
    const { data } = svc.uploads.read(v.wavUpload, "voice");
    return { write: (t) => { mkdirSync(t.dir, { recursive: true }); writeFileSync(t.wav, data); writeFileSync(t.txt, `${v.text}\n`); } };
  }
  if (v.mode === "reuse") {
    const from = svc.brands.get(v.from);
    const dir = svc.brands.paths(v.from, from).brandDir;
    const wav = from?.voice.sample ? resolve(dir, from.voice.sample) : "";
    const txt = from?.voice.sampleText ? resolve(dir, from.voice.sampleText) : "";
    if (!from || !wav || !inside(dir, wav) || !existsSync(wav)) throw new BrandError(`The brand "${v.from}" has no voice sample to reuse.`);
    if (!txt || !inside(dir, txt) || !existsSync(txt)) throw new BrandError(`The brand "${v.from}" has no text for its voice sample.`);
    const settings = wav.replace(/\.wav$/, ".json");
    return { write: (t) => { mkdirSync(t.dir, { recursive: true }); copyFileSync(wav, t.wav); copyFileSync(txt, t.txt); if (existsSync(settings)) copyFileSync(settings, t.settings); } };
  }
  if (staged && existsSync(join(staged, "voice.wav")) && existsSync(join(staged, "voice.txt"))) {
    return { write: (t) => { mkdirSync(t.dir, { recursive: true }); copyFileSync(join(staged, "voice.wav"), t.wav); copyFileSync(join(staged, "voice.txt"), t.txt); } };
  }
  return null;
}

/** Copies the files of a character that another brand has (script, model, head shape, and the rendered movements) into this brand's mascot folder. Movements are cloned on a file system that can, so the 500 MB are not paid twice. */
function copyCharacter(from: FoundCharacter, to: BrandPaths): void {
  const src = characterFiles({ mascotDir: from.dir }, from.id), dst = characterFiles(to, from.id);
  mkdirSync(to.mascotDir, { recursive: true });
  for (const k of ["script", "blend", "head"] as const) if (existsSync(src[k])) copyFileSync(src[k], dst[k]);
  const moves = join(from.dir, "movements");
  if (existsSync(moves)) cpSync(moves, to.movementsDir, { recursive: true, mode: fsConstants.COPYFILE_FICLONE });
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
  const brand = assembleBrand(req, svc, voice !== null);
  const character = brand.character.enabled && req.character.mode === "import" ? findCharacter(brandsDirOf(svc.dataDir), brand.character.id) : null;
  if (brand.character.enabled && req.character.mode === "import" && !character) throw new BrandError(`There is no character "${brand.character.id}" on this machine (<brand>/mascot/${brand.character.id}.py).`);

  const p = svc.brands.paths(brand.slug, brand);
  const folders = [p.brandDir]; // identity, character, reels and the hub data of the brand are all in this one folder
  if (svc.brands.has(brand.slug)) {
    const m = readMarker(p.dataDir);
    if (m?.requestId === requestId && m.summary) { step(4, "This request already created the brand."); return m.summary; }
    throw new BrandError(`The brand "${brand.slug}" already exists. Nothing was changed.`);
  }
  if (readMarker(p.dataDir)?.requestId === requestId) folders.forEach((f) => rmSync(f, { recursive: true, force: true })); // leftovers of a run that was cut off
  const busy = folders.find((f) => existsSync(f));
  if (busy) throw new BrandError(`The folder ${relative(svc.root, busy) || busy} already exists, so "${brand.slug}" cannot be created. Nothing was changed.`);

  try {
    step(1, `Creating ${brand.slug}`);
    mkdirSync(p.dataDir, { recursive: true });
    writeFileSync(join(p.dataDir, MARKER), JSON.stringify({ requestId }));
    svc.brands.create(brand);

    step(2, "Writing brand.json, style.md and the other files");
    let logo: "png" | null = null;
    const logoSource = req.logoUpload ? svc.uploads.read(req.logoUpload, "logo") : null;
    if (logoSource) logo = "png";
    else if (stagedDir && existsSync(join(stagedDir, "logo.png"))) logo = "png";
    if (logo) {
      if (logoSource) writeFileSync(p.logo, logoSource.data); else copyFileSync(join(stagedDir as string, "logo.png"), p.logo);
    }
    if (voice) voice.write(voiceTarget(p, brand.character));
    if (character) copyCharacter(character, p);

    const filled = readFileSync(p.styleMd, "utf8");
    const importedStyle = stagedDir && existsSync(join(stagedDir, "style.md")) ? readFileSync(join(stagedDir, "style.md"), "utf8") : null;
    const style = req.styleMd?.trim() ? req.styleMd : importedStyle ?? adaptStyle(filled, brand, { logo, voice: voice !== null, ...(req.character.mode === "create" && req.character.fields?.what ? { mascot: req.character.fields.what } : {}) });
    writeFileSync(p.styleMd, `${style.trimEnd()}\n`);
    const importedQuestions = stagedDir && existsSync(join(stagedDir, "reel-questions.md")) ? readFileSync(join(stagedDir, "reel-questions.md"), "utf8") : null;
    const templateQuestions = join(svc.brands.templateDir, "reel-questions.md");
    const questionsHead = existsSync(templateQuestions) ? fillTemplate(readFileSync(templateQuestions, "utf8"), brand) : readFileSync(p.questionsMd, "utf8");
    writeFileSync(p.questionsMd, importedQuestions ?? emptyQuestions(questionsHead, brand.name));

    if (req.character.mode === "create") {
      writeState(p.brandDir, { ...readState(p.brandDir), name: req.character.name, ...(req.character.fields ? { fields: req.character.fields } : {}) });
    }
    const sheet = req.character.sheetUpload && req.character.mode !== "none" ? svc.uploads.read(req.character.sheetUpload, "sheet") : null;
    if (sheet) saveSheet(p.brandDir, sheet.data);

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
      slug: brand.slug, name: brand.name, source: req.source, daily: req.dailyLoop, logo, voice: voice ? voiceRelPaths(brand.character).sample : null,
      character: req.character.mode, folders: folders.map((f) => { const r = relative(svc.root, f); return r.startsWith("..") ? f : r; }),
      files: listFiles(p.brandDir).filter((f) => !f.startsWith("mascot/movements/")).map((f) => `brand/${brand.slug}/${f}`), nextSteps: NEXT_STEPS,
    };
    writeFileSync(join(p.dataDir, MARKER), JSON.stringify({ requestId, summary }));
    for (const id of [req.logoUpload, voice && req.voice.mode === "upload" ? req.voice.wavUpload : undefined, req.character.sheetUpload, req.importId]) if (id) svc.uploads.remove(id);
    step(4, `Brand ${brand.slug} is ready`);
    return summary;
  } catch (e) {
    for (const f of folders) rmSync(f, { recursive: true, force: true });
    ctx.update({ log: "Rolled back: everything this run created was removed." });
    throw e;
  }
};
