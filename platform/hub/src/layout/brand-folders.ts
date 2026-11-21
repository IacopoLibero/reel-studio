import { copyFileSync, constants as fsConstants, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { brandPaths, characterFiles, voiceTarget, type BrandPaths } from "../brands/paths.js";
import { isValidSlug, validateBrand, type Brand } from "../brands/schema.js";
import { compareTrees, listFiles, sha256 } from "./fs-tools.js";

/**
 * Moves a workspace from the first brand layout to the one-folder-per-brand layout, by copying and checking (nothing is deleted here):
 *
 *   brand/<slug>/brand.json, style.md, logo.png, <voice>.wav .txt .json, reel-questions.md  ->  brand/<slug>/identity/ (the voice, the logo and
 *                                                                                                  the style guide), the questions go to the data folder
 *   reels/<slug>/<n>-<name>/                    ->  brand/<slug>/reels/<n>-<name>/   (with the final audio from public/<n>-<name>/ in its audio/)
 *   mascot/<id>.py .blend -expressions.png, mascot/work/head.json  ->  brand/<slug>/mascot/<id>.py ... <id>-head.json
 *   public/mascot/<move>/                        ->  brand/<slug>/mascot/movements/<move>/
 *   characters/<slug>/                           ->  brand/<slug>/mascot/studio/
 *
 * The old files stay where they are until `removeOldFiles` is asked to take them away, and it only does so for files whose copy was checked again.
 */

export const MARKER = ".reel-studio/brand-folders.json";

export interface BrandFoldersOptions { workspace: string; data: string; apply: boolean; log?: (line: string) => void }

interface Copy { from: string; to: string; what: string }
interface Write { to: string; what: string; content: string }
export interface BrandPlan { slug: string; copies: Copy[]; writes: Write[]; notes: string[]; problems: string[] }
export interface BrandFoldersResult {
  status: "nothing" | "planned" | "applied" | "already" | "blocked";
  brands: BrandPlan[];
  problems: string[];
  verified: boolean;
  /** Old files and folders that the copy made unnecessary, as absolute paths (nothing in this run deleted them). */
  leftovers: string[];
}

const dirs = (p: string): string[] => { try { return readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; } };
const read = (p: string): string => readFileSync(p, "utf8");
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Brand folders in the first layout: a brand.json at the top of brand/<slug>/ and no identity/ yet. */
export function findOldBrands(workspace: string): string[] {
  return dirs(join(workspace, "brand")).filter((n) => isValidSlug(n) && existsSync(join(workspace, "brand", n, "brand.json")) && !existsSync(join(workspace, "brand", n, "identity", "brand.json"))).sort();
}

/**
 * Rewrites the paths a brand's style.md names, so the guide Claude reads still points at real files: the logo, the voice files, the character script and
 * model, the voice guide, the reel folders. A style.md that names none of them comes back unchanged.
 */
export function updateStyleGuide(md: string, slug: string, brand: Pick<Brand, "character">, voice: { oldWav: string | null; oldTxt: string | null; newWav: string | null; newTxt: string | null }): string {
  let out = md;
  const b = `brand/${slug}`;
  out = out.split(`${b}/logo.png`).join(`${b}/identity/logo.png`);
  if (voice.oldWav && voice.newWav) out = out.split(`${b}/${voice.oldWav}`).join(`${b}/${voice.newWav}`);
  if (voice.oldTxt && voice.newTxt) out = out.split(`${b}/${voice.oldTxt}`).join(`${b}/${voice.newTxt}`);
  out = out.replace(/ See `voice-sample\.md` in this folder for how to record it\./g, " See `.claude/skills/reel/voice-sample.md` for how to record it.");
  out = out.replace(/(?<![\w/])reels\/([a-z0-9-]+)\//g, (m, s: string) => (s === slug ? `${b}/reels/` : m));
  if (brand.character.enabled) {
    const id = escapeRe(brand.character.id);
    out = out.replace(new RegExp(`(?<![\\w/])mascot/(${id}\\.(?:py|blend))`, "g"), `${b}/mascot/$1`);
    out = out.replace(/(?<![\w/])public\/mascot\//g, `${b}/mascot/movements/`);
  }
  return out;
}

const sameContent = (a: string, b: string): boolean => existsSync(a) && existsSync(b) && sha256(a) === sha256(b);

function planBrand(workspace: string, data: string, slug: string): BrandPlan {
  const plan: BrandPlan = { slug, copies: [], writes: [], notes: [], problems: [] };
  const old = join(workspace, "brand", slug);
  let raw: unknown;
  try { raw = JSON.parse(read(join(old, "brand.json"))); } catch { plan.problems.push(`brand/${slug}/brand.json is not valid JSON`); return plan; }
  const v = validateBrand(raw);
  if (!v.ok) { plan.problems.push(`brand/${slug}/brand.json: ${v.errors.join("; ")}`); return plan; }
  const brand = v.brand;
  const p = pathsOf(workspace, data, slug);
  const copy = (from: string, to: string, what: string) => plan.copies.push({ from, to, what });

  // Voice: next to the character's files when the brand has a character, else in identity/.
  const target = voiceTarget(p, brand.character);
  let voice = { oldWav: null as string | null, oldTxt: null as string | null, newWav: null as string | null, newTxt: null as string | null };
  let newVoice = { sample: null as string | null, sampleText: null as string | null };
  const oldWav = brand.voice.sample ? join(old, brand.voice.sample) : null;
  if (brand.voice.sample && oldWav && existsSync(oldWav)) {
    const oldTxt = brand.voice.sampleText ? join(old, brand.voice.sampleText) : null;
    copy(oldWav, target.wav, "voice sample");
    if (oldTxt && existsSync(oldTxt)) copy(oldTxt, target.txt, "words of the voice sample");
    const settings = oldWav.replace(/\.wav$/, ".json");
    if (existsSync(settings)) copy(settings, target.settings, "voice settings");
    voice = { oldWav: brand.voice.sample, oldTxt: brand.voice.sampleText, newWav: target.relWav, newTxt: oldTxt && existsSync(oldTxt) ? target.relTxt : null };
    newVoice = { sample: target.relWav, sampleText: voice.newTxt };
  } else if (brand.voice.sample) plan.notes.push(`the voice sample "${brand.voice.sample}" named in brand.json is not there: the voice is set to decide later`);

  const newBrand: Brand = { ...brand, voice: { ...brand.voice, ...newVoice } };
  plan.writes.push({ to: p.brandJson, what: "brand.json", content: `${JSON.stringify(newBrand, null, 2)}\n` });
  const style = join(old, "style.md");
  if (existsSync(style)) plan.writes.push({ to: p.styleMd, what: "style.md (paths updated)", content: updateStyleGuide(read(style), slug, brand, voice) });
  else plan.notes.push("there is no style.md");
  if (existsSync(join(old, "logo.png"))) copy(join(old, "logo.png"), p.logo, "logo");
  const questions = join(old, "reel-questions.md");
  if (existsSync(questions)) copy(questions, p.questionsMd, "question list");

  // Reels, with the final audio that used to sit in public/<folder>/.
  const reels = join(workspace, "reels", slug);
  if (existsSync(reels)) {
    copy(reels, p.reelsDir, "reels");
    for (const folder of dirs(reels)) {
      const pub = join(workspace, "public", folder);
      for (const f of existsSync(pub) ? readdirSync(pub) : []) {
        if (!/^[A-Za-z0-9_]+\.wav$/.test(f)) continue;
        const inReel = join(reels, folder, "audio", f);
        if (!existsSync(inReel)) copy(join(pub, f), join(p.reelsDir, folder, "audio", f), `final audio of ${folder}`);
        else if (!sameContent(inReel, join(pub, f))) plan.problems.push(`reels/${slug}/${folder}/audio/${f} and public/${folder}/${f} differ: decide which is the right one`);
      }
    }
  }

  // The character, its moves and its studio.
  if (brand.character.enabled) {
    const id = brand.character.id;
    const cf = characterFiles(p, id);
    const script = join(workspace, "mascot", `${id}.py`);
    if (existsSync(script)) copy(script, cf.script, "character script");
    else plan.problems.push(`mascot/${id}.py (the character of ${slug}) is not there`);
    const blend = join(workspace, "mascot", `${id}.blend`), sheet = join(workspace, "mascot", `${id}-expressions.png`), head = join(workspace, "mascot", "work", "head.json");
    if (existsSync(blend)) copy(blend, cf.blend, "character model");
    if (existsSync(sheet)) copy(sheet, cf.sheet, "expression sheet");
    if (existsSync(head)) copy(head, cf.head, "head shape");
    const moves = join(workspace, "public", "mascot");
    if (existsSync(moves)) copy(moves, p.movementsDir, "rendered moves");
  }
  const studio = join(workspace, "characters", slug);
  if (existsSync(studio)) copy(studio, join(p.mascotDir, "studio"), "character studio");
  return plan;
}

const pathsOf = (workspace: string, data: string, slug: string): BrandPaths => brandPaths(slug, { root: workspace, dataDir: data, chromeRoot: null });

/** What is missing or different in the copy. Extra files in the destination are not a problem (the final audio of public/ is added to the reels). */
const lacking = (from: string, to: string): string[] => compareTrees(from, to).filter((x) => !x.startsWith("unexpected:"));

function applyCopy(c: Copy): void {
  mkdirSync(dirname(c.to), { recursive: true });
  // Trees are cloned where the file system can (the character's 500 MB of frames cost nothing then), else copied.
  cpSync(c.from, c.to, { recursive: true, force: false, errorOnExist: false, mode: fsConstants.COPYFILE_FICLONE });
}

function verifyCopy(c: Copy): string[] {
  return lacking(c.from, c.to).map((x) => `${c.what}: ${x} (${relative(dirname(c.to), c.to) || c.to})`);
}

/** Plans the move of every brand folder in the first layout and, with `apply`, copies and checks it. Safe to run again: a brand already moved is skipped. */
export function migrateBrandFolders(o: BrandFoldersOptions): BrandFoldersResult {
  const log = o.log ?? (() => undefined);
  const old = findOldBrands(o.workspace);
  if (old.length === 0) {
    const already = existsSync(join(o.workspace, MARKER));
    return { status: already ? "already" : "nothing", brands: [], problems: [], verified: already, leftovers: [] };
  }
  const brands = old.map((slug) => planBrand(o.workspace, o.data, slug));
  const problems = brands.flatMap((b) => b.problems);
  const leftovers = oldFiles(o.workspace, brands);
  if (!o.apply) return { status: "planned", brands, problems, verified: false, leftovers };
  if (problems.length) return { status: "blocked", brands, problems, verified: false, leftovers };

  const mistakes: string[] = [];
  for (const b of brands) {
    log(`${b.slug}: ${b.copies.length} copies, ${b.writes.length} files rewritten`);
    for (const c of b.copies) {
      if (existsSync(c.to) && listFiles(c.to).length && lacking(c.from, c.to).length) { mistakes.push(`${c.what}: ${c.to} already exists and differs from ${c.from}`); continue; }
      applyCopy(c);
    }
    for (const w of b.writes) { mkdirSync(dirname(w.to), { recursive: true }); writeFileSync(w.to, w.content); }
    for (const c of b.copies) mistakes.push(...verifyCopy(c));
    for (const w of b.writes) if (!existsSync(w.to) || read(w.to) !== w.content) mistakes.push(`${w.what}: ${w.to} was not written as planned`);
  }
  const verified = mistakes.length === 0;
  const note = { at: new Date().toISOString(), verified, brands: brands.map((b) => b.slug), problems: mistakes };
  mkdirSync(join(o.workspace, ".reel-studio"), { recursive: true });
  writeFileSync(join(o.workspace, verified ? MARKER : ".reel-studio/brand-folders-failed.json"), `${JSON.stringify(note, null, 2)}\n`);
  return { status: "applied", brands, problems: mistakes, verified, leftovers };
}

/** The old files the moved brands no longer need: the flat files of brand/<slug>/, reels/<slug>, the character's old folders. */
function oldFiles(workspace: string, brands: readonly BrandPlan[]): string[] {
  const out: string[] = [];
  const add = (p: string) => { if (existsSync(p)) out.push(p); };
  for (const b of brands) {
    const old = join(workspace, "brand", b.slug);
    for (const f of ["brand.json", "style.md", "logo.png", "reel-questions.md", "voice-sample.md"]) add(join(old, f));
    for (const c of b.copies) if (c.from.startsWith(old) && !out.includes(c.from)) add(c.from);
    add(join(old, "voice"));
    add(join(workspace, "reels", b.slug));
    add(join(workspace, "characters", b.slug));
  }
  return [...new Set(out)];
}

export interface RemoveOptions {
  workspace: string;
  data: string;
  /** False lists what would go and removes nothing. */
  remove: boolean;
  /** The program folder: its brand/_template and sfx/ show that the workspace's copies of them are not needed. */
  programRoot?: string;
}
export interface RemoveResult { removed: string[]; kept: { path: string; why: string }[] }

/**
 * Takes away the old copies after a verified move. A leftover goes only when what replaced it exists and, where the content was copied as it was,
 * is identical (checked again now); never before the record of a verified move exists. Returns what it removed and what it kept, with the reason.
 */
export function removeOldFiles(o: RemoveOptions): RemoveResult {
  const removed: string[] = [], kept: { path: string; why: string }[] = [];
  const marker = join(o.workspace, MARKER);
  if (!existsSync(marker)) return { removed, kept: [{ path: marker, why: "no verified move of the brand folders was recorded" }] };
  const slugs = (JSON.parse(read(marker)) as { brands?: string[] }).brands ?? [];

  /** `rewritten`: the new file was written from the old one with changes, so it only has to exist. `to` null: nothing replaces it (the file moved out of the brand). */
  const take = (from: string, to: string | null, rewritten = false): void => {
    if (!existsSync(from)) return;
    if (to !== null) {
      if (!existsSync(to)) { kept.push({ path: from, why: `${to} does not exist` }); return; }
      const problems = rewritten ? [] : lacking(from, to);
      if (problems.length) { kept.push({ path: from, why: `the copy in ${to} is not identical: ${problems[0]}` }); return; }
    }
    if (o.remove) rmSync(from, { recursive: true, force: true });
    removed.push(from);
  };

  const migrated: { slug: string; brand: Brand | null; paths: BrandPaths }[] = [];
  for (const slug of slugs) {
    const p = pathsOf(o.workspace, o.data, slug);
    const old = join(o.workspace, "brand", slug);
    let brand: Brand | null = null;
    try { const v = validateBrand(JSON.parse(read(join(old, "brand.json")))); brand = v.ok ? v.brand : null; } catch { /* the old brand.json is gone already */ }
    if (!brand) brand = readNew(p);
    migrated.push({ slug, brand, paths: p });
    take(join(old, "brand.json"), p.brandJson, true);
    take(join(old, "style.md"), p.styleMd, true);
    take(join(old, "logo.png"), p.logo);
    take(join(old, "reel-questions.md"), p.questionsMd);
    take(join(old, "voice-sample.md"), null);
    if (brand?.voice.sample) {
      const t = voiceTarget(p, brand.character);
      const wav = join(old, brand.voice.sample);
      take(wav, t.wav);
      if (brand.voice.sampleText) take(join(old, brand.voice.sampleText), t.txt);
      take(wav.replace(/\.wav$/, ".json"), t.settings);
      if (/^voice\//.test(brand.voice.sample)) take(join(old, "voice"), null);
    }
    take(join(o.workspace, "reels", slug), p.reelsDir);
    take(join(o.workspace, "characters", slug), join(p.mascotDir, "studio"));
    if (brand?.character.enabled) {
      const id = brand.character.id, cf = characterFiles(p, id);
      take(join(o.workspace, "mascot", `${id}.py`), cf.script);
      take(join(o.workspace, "mascot", `${id}.blend`), cf.blend);
      take(join(o.workspace, "mascot", `${id}-expressions.png`), cf.sheet);
      take(join(o.workspace, "mascot", "work", "head.json"), cf.head);
    }
  }

  // What was shared by all brands in the first layout.
  const withCharacter = migrated.find((m) => m.brand?.character.enabled);
  if (withCharacter) take(join(o.workspace, "public", "mascot"), withCharacter.paths.movementsDir);
  for (const m of migrated) {
    for (const folder of dirs(m.paths.reelsDir)) {
      const pub = join(o.workspace, "public", folder);
      if (!existsSync(pub)) continue;
      const wavs = readdirSync(pub);
      const unknown = wavs.filter((f) => !/^[A-Za-z0-9_]+\.wav$/.test(f));
      if (unknown.length) { kept.push({ path: pub, why: `it also holds ${unknown[0]}, which is not a final audio file` }); continue; }
      const odd = wavs.find((f) => !sameContent(join(pub, f), join(m.paths.reelsDir, folder, "audio", f)));
      if (odd) { kept.push({ path: pub, why: `${odd} is not identical to the audio in the reel's folder` }); continue; }
      take(pub, null);
    }
  }
  const publicLogo = join(o.workspace, "public", "logo.png");
  if (existsSync(publicLogo)) {
    if (migrated.some((m) => sameContent(publicLogo, m.paths.logo))) take(publicLogo, null);
    else kept.push({ path: publicLogo, why: "it is not the logo of a moved brand" });
  }
  if (o.programRoot) {
    const sounds = join(o.programRoot, "sfx"), oldSounds = join(o.workspace, "public", "a1");
    if (existsSync(oldSounds)) {
      const missing = readdirSync(oldSounds).filter((f) => !sameContent(join(oldSounds, f), join(sounds, f)));
      if (missing.length) kept.push({ path: oldSounds, why: `${missing.join(", ")} is not in the program's sfx/ folder (or differs)` });
      else take(oldSounds, null);
    }
    const tpl = join(o.workspace, "brand", "_template");
    if (existsSync(tpl)) {
      if (lacking(tpl, join(o.programRoot, "brand", "_template")).length) kept.push({ path: tpl, why: "it differs from the template of the program" });
      else take(tpl, null);
    }
  }
  if (o.remove) for (const d of ["public", "mascot", "reels", "characters"]) pruneIfEmpty(join(o.workspace, d));
  return { removed, kept };
}

/** Reads a brand.json of the new layout (used when the old one is already gone). */
function readNew(p: BrandPaths): Brand | null {
  try { const v = validateBrand(JSON.parse(read(p.brandJson))); return v.ok ? v.brand : null; } catch { return null; }
}

/** Removes a folder that holds nothing but empty folders. */
function pruneIfEmpty(dir: string): void {
  if (!existsSync(dir)) return;
  if (listFiles(dir).length === 0) rmSync(dir, { recursive: true, force: true });
}
