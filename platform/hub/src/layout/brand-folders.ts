import { constants as fsConstants, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { brandPaths, characterFiles, voiceTarget, type BrandPaths } from "../brands/paths.js";
import { isValidSlug, validateBrand, type Brand } from "../brands/schema.js";
import { compareTrees, findSymlinks, listFiles, sha256 } from "./fs-tools.js";

/**
 * Moves a workspace from the first brand layout to the one-folder-per-brand layout, by copying and checking (nothing is deleted here):
 *
 *   brand/<slug>/brand.json, style.md, logo.png, <voice>.wav .txt .json, reel-questions.md  ->  brand/<slug>/identity/ (the voice, the logo and
 *                                                                                                  the style guide), the questions go to the data folder
 *   reels/<slug>/<n>-<name>/                    ->  brand/<slug>/reels/<n>-<name>/   (with the final audio from public/<n>-<name>/ in its audio/)
 *   mascot/<id>.py .blend, mascot/work/head.json  ->  <brand>/mascot/<id>.py ... <id>-head.json; mascot/<id>-expressions.png -> <brand>/mascot/studio/reference-sheet.png
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

/** Brand folders in the first layout: a brand.json at the top of workspace/brand/<slug>/, and no identity/ yet in the workspace or in the data folder. */
export function findOldBrands(workspace: string, data: string): string[] {
  return dirs(join(workspace, "brand")).filter((n) => isValidSlug(n) && existsSync(join(workspace, "brand", n, "brand.json"))
    && !existsSync(join(workspace, "brand", n, "identity", "brand.json")) && !existsSync(pathsOf(workspace, data, n).brandJson)).sort();
}

/**
 * Rewrites the paths a brand's style.md names, so the guide Claude reads still points at real files: the logo, the voice files, the character script and
 * model, the voice guide, the reel folders. A style.md that names none of them comes back unchanged.
 */
export function updateStyleGuide(md: string, slug: string, brand: Pick<Brand, "character">, voice: { oldWav: string | null; oldTxt: string | null; newWav: string | null; newTxt: string | null }): string {
  let out = md;
  const b = `brand/${slug}`;
  // Paths in a brand's style guide are relative to the brand's own folder.
  out = out.split(`${b}/logo.png`).join("identity/logo.png");
  if (voice.oldWav && voice.newWav) out = out.split(`${b}/${voice.oldWav}`).join(voice.newWav);
  if (voice.oldTxt && voice.newTxt) out = out.split(`${b}/${voice.oldTxt}`).join(voice.newTxt);
  out = out.replace(/ See `voice-sample\.md` in this folder for how to record it\./g, " See `.claude/skills/reel/voice-sample.md` for how to record it.");
  out = out.replace(/(?<![\w/])reels\/([a-z0-9-]+)\//g, (m, s: string) => (s === slug ? "reels/" : m));
  if (brand.character.enabled) out = out.replace(/(?<![\w/])public\/mascot\//g, "mascot/movements/");
  return out;
}

/** The style guide of a brand that was already in the one-folder layout inside the workspace: `brand/<slug>/identity/logo.png` becomes `identity/logo.png`. */
export const relativeStyleGuide = (md: string, slug: string): string => md.split(`brand/${slug}/`).join("");

const regularFile = (p: string): boolean => { try { return lstatSync(p).isFile(); } catch { return false; } };
const sameContent = (a: string, b: string): boolean => regularFile(a) && regularFile(b) && sha256(a) === sha256(b);
/** A path inside a brand folder as brand.json writes it: relative, never leaving the folder. */
const safeRel = (p: string | null): p is string => !!p && !p.startsWith("/") && !p.split("/").includes("..") && !/[\u0000-\u001f\\]/.test(p);

const pathsOf = (workspace: string, data: string, slug: string): BrandPaths => brandPaths(slug, { dataDir: data, chromeRoot: null });

/** What is missing or different in the copy. Extra files in the destination are not a problem (the final audio of public/ is added to the reels). */
const lacking = (from: string, to: string): string[] => compareTrees(from, to).filter((x) => !x.startsWith("unexpected:"));
/** Files that exist on both sides with different content: the only thing that stops a copy (a destination that merely lacks files is filled in). */
const conflicts = (from: string, to: string): string[] => lacking(from, to).filter((x) => /differs/.test(x));

interface VoiceMove { copies: Copy[]; voice: { oldWav: string | null; oldTxt: string | null; newWav: string | null; newTxt: string | null }; newVoice: { sample: string | null; sampleText: string | null }; notes: string[]; problems: string[] }

/** Where the voice files of an old brand go: next to the character's files when the brand has a character, else in identity/. */
function voiceMove(old: string, brand: Brand, p: BrandPaths): VoiceMove {
  const m: VoiceMove = { copies: [], voice: { oldWav: null, oldTxt: null, newWav: null, newTxt: null }, newVoice: { sample: null, sampleText: null }, notes: [], problems: [] };
  const { sample, sampleText } = brand.voice;
  if (!sample) return m;
  if (!safeRel(sample) || (sampleText !== null && !safeRel(sampleText))) { m.problems.push(`the voice paths in brand.json ("${sample}") must stay inside the brand folder`); return m; }
  const oldWav = join(old, sample);
  if (!existsSync(oldWav)) { m.notes.push(`the voice sample "${sample}" named in brand.json is not there: the voice is set to decide later`); return m; }
  const target = voiceTarget(p, brand.character);
  const oldTxt = sampleText ? join(old, sampleText) : null;
  m.copies.push({ from: oldWav, to: target.wav, what: "voice sample" });
  if (oldTxt && existsSync(oldTxt)) m.copies.push({ from: oldTxt, to: target.txt, what: "words of the voice sample" });
  const settings = oldWav.replace(/\.wav$/, ".json");
  if (existsSync(settings)) m.copies.push({ from: settings, to: target.settings, what: "voice settings" });
  const hasTxt = !!oldTxt && existsSync(oldTxt);
  m.voice = { oldWav: sample, oldTxt: sampleText, newWav: target.relWav, newTxt: hasTxt ? target.relTxt : null };
  m.newVoice = { sample: target.relWav, sampleText: m.voice.newTxt };
  return m;
}

/** The two files the move writes instead of copying: the style guide (paths updated) first, brand.json last (it is what makes a brand "moved"). */
function identityWrites(old: string, slug: string, brand: Brand, p: BrandPaths, vm: VoiceMove): { writes: Write[]; notes: string[] } {
  const writes: Write[] = [], notes: string[] = [];
  const style = join(old, "style.md");
  if (existsSync(style)) writes.push({ to: p.styleMd, what: "style.md (paths updated)", content: updateStyleGuide(read(style), slug, brand, vm.voice) });
  else notes.push("there is no style.md");
  const newBrand: Brand = { ...brand, voice: { ...brand.voice, ...vm.newVoice } };
  writes.push({ to: p.brandJson, what: "brand.json", content: `${JSON.stringify(newBrand, null, 2)}\n` });
  return { writes, notes };
}

function readOldBrand(old: string): { brand: Brand } | { error: string } {
  let raw: unknown;
  try { raw = JSON.parse(read(join(old, "brand.json"))); } catch { return { error: "is not valid JSON" }; }
  const v = validateBrand(raw);
  return v.ok ? { brand: v.brand } : { error: v.errors.join("; ") };
}

function planBrand(workspace: string, data: string, slug: string): BrandPlan {
  const plan: BrandPlan = { slug, copies: [], writes: [], notes: [], problems: [] };
  const old = join(workspace, "brand", slug);
  const parsed = readOldBrand(old);
  if ("error" in parsed) { plan.problems.push(`brand/${slug}/brand.json ${parsed.error}`); return plan; }
  const brand = parsed.brand;
  const p = pathsOf(workspace, data, slug);
  const copy = (from: string, to: string, what: string) => plan.copies.push({ from, to, what });

  const vm = voiceMove(old, brand, p);
  plan.copies.push(...vm.copies); plan.notes.push(...vm.notes); plan.problems.push(...vm.problems);
  const w = identityWrites(old, slug, brand, p, vm);
  plan.writes.push(...w.writes); plan.notes.push(...w.notes);
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
    // The sheet the character was drawn from is the reference sheet of its studio (nothing reads it while reels are made).
    if (existsSync(sheet) && !existsSync(join(workspace, "characters", slug, "reference-sheet.png"))) copy(sheet, join(p.mascotDir, "studio", "reference-sheet.png"), "reference sheet");
    if (existsSync(head)) copy(head, cf.head, "head shape");
    const moves = join(workspace, "public", "mascot");
    if (existsSync(moves)) copy(moves, p.movementsDir, "rendered moves");
  }
  const studio = join(workspace, "characters", slug);
  if (existsSync(studio)) copy(studio, join(p.mascotDir, "studio"), "character studio");
  return plan;
}

function applyCopy(c: Copy): void {
  mkdirSync(dirname(c.to), { recursive: true });
  // Trees are cloned where the file system can (the character's 500 MB of frames cost nothing then), else copied.
  cpSync(c.from, c.to, { recursive: true, force: false, errorOnExist: false, mode: fsConstants.COPYFILE_FICLONE });
}

function verifyCopy(c: Copy): string[] {
  return lacking(c.from, c.to).map((x) => `${c.what}: ${x} (${relative(dirname(c.to), c.to) || c.to})`);
}

const readMarker = (workspace: string): { brands: string[] } | null => {
  try {
    const m = JSON.parse(read(join(workspace, MARKER))) as { brands?: unknown };
    return Array.isArray(m.brands) && m.brands.every((b) => typeof b === "string" && isValidSlug(b)) ? { brands: m.brands as string[] } : null;
  } catch { return null; }
};

/**
 * Plans the move of every brand folder in the first layout and, with `apply`, copies and checks it. Safe to run again: a brand already moved is skipped,
 * and a brand whose copy could not be checked keeps its old layout (its brand.json is written last), so the next run tries it again.
 */
export function migrateBrandFolders(o: BrandFoldersOptions): BrandFoldersResult {
  const log = o.log ?? (() => undefined);
  const old = findOldBrands(o.workspace, o.data);
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
  const moved: string[] = [];
  for (const b of brands) {
    log(`${b.slug}: ${b.copies.length} copies, ${b.writes.length} files rewritten`);
    const own: string[] = [];
    for (const c of b.copies) {
      if (existsSync(c.to) && listFiles(c.to).length && conflicts(c.from, c.to).length) {
        own.push(`${c.what}: ${c.to} already exists and differs from ${c.from}. If it is a leftover of an interrupted copy, delete it and run this again`);
        continue;
      }
      applyCopy(c);
    }
    for (const c of b.copies) own.push(...verifyCopy(c));
    if (own.length === 0) {
      for (const w of b.writes) { mkdirSync(dirname(w.to), { recursive: true }); writeFileSync(w.to, w.content); } // brand.json is the last of them
      for (const w of b.writes) if (!existsSync(w.to) || read(w.to) !== w.content) own.push(`${w.what}: ${w.to} was not written as planned`);
    }
    if (own.length === 0) moved.push(b.slug); else mistakes.push(...own.map((m) => `${b.slug}: ${m}`));
  }
  const verified = mistakes.length === 0;
  mkdirSync(join(o.workspace, ".reel-studio"), { recursive: true });
  const earlier = readMarker(o.workspace)?.brands ?? [];
  const note = { at: new Date().toISOString(), verified, brands: [...new Set([...earlier, ...moved])].sort(), problems: mistakes };
  writeFileSync(join(o.workspace, moved.length ? MARKER : ".reel-studio/brand-folders-failed.json"), `${JSON.stringify(note, null, 2)}\n`);
  return { status: "applied", brands, problems: mistakes, verified, leftovers };
}

/** The old files the moved brands no longer need: the flat files of brand/<slug>/, reels/<slug>, the character's old folders. */
function oldFiles(workspace: string, brands: readonly BrandPlan[]): string[] {
  const out: string[] = [];
  const add = (p: string) => { if (existsSync(p)) out.push(p); };
  for (const b of brands) {
    const old = join(workspace, "brand", b.slug);
    for (const f of ["brand.json", "style.md", "logo.png", "reel-questions.md"]) add(join(old, f));
    for (const c of b.copies) if (c.from.startsWith(old) && !out.includes(c.from)) add(c.from);
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

/** A folder that holds only empty folders (no file, no link, nothing else). */
function onlyEmptyDirs(dir: string): boolean {
  try {
    return readdirSync(dir, { withFileTypes: true }).every((e) => e.isDirectory() && !lstatSync(join(dir, e.name)).isSymbolicLink() && onlyEmptyDirs(join(dir, e.name)));
  } catch { return false; }
}

/**
 * Takes away the old copies after a verified move. A leftover goes only when what replaced it exists and, where the content was copied as it was,
 * is identical (checked again now); the two files that were rewritten (brand.json, style.md) only when the new file is exactly what the move would
 * make of the old one, so nothing typed into the old file after the move is lost. Never before the record of a verified move exists, never a folder with a
 * link inside, never a file nobody copied. Returns what it removed and what it kept, with the reason.
 */
export function removeOldFiles(o: RemoveOptions): RemoveResult {
  const removed: string[] = [], kept: { path: string; why: string }[] = [];
  const marker = join(o.workspace, MARKER);
  const record = readMarker(o.workspace);
  if (!record) return { removed, kept: [{ path: marker, why: "no verified move of the brand folders was recorded (or the record cannot be read)" }] };
  const gone: string[] = []; // what this run has removed or would remove, so a folder can be judged "empty after that"
  const isGone = (p: string): boolean => gone.some((g) => p === g || p.startsWith(`${g}${sep}`));

  const finish = (path: string): void => { if (o.remove) rmSync(path, { recursive: true, force: true }); removed.push(path); gone.push(path); };
  const keep = (path: string, why: string): void => { kept.push({ path, why }); };
  /** `to` is the verified copy. */
  const take = (from: string, to: string): void => {
    if (!existsSync(from)) return;
    if (findSymlinks(from).length) return keep(from, "it holds a symbolic link, which the move does not copy");
    if (!existsSync(to)) return keep(from, `${to} does not exist`);
    const problems = lacking(from, to);
    if (problems.length) return keep(from, `the copy in ${to} is not identical: ${problems[0]}`);
    finish(from);
  };
  /** A rewritten file goes when the new one is what the move would make of the old one. */
  const takeRewritten = (from: string, to: string, expected: string | null): void => {
    if (!existsSync(from)) return;
    if (expected === null) return keep(from, "the move cannot be recomputed for it");
    if (!existsSync(to)) return keep(from, `${to} does not exist`);
    if (read(to) !== expected) return keep(from, `${to} is not what the move makes of this file: one of the two was changed after the move`);
    finish(from);
  };
  /** A folder goes when every file in it has already been removed (its contents were copied one by one). */
  const takeIfEmptied = (dir: string): void => {
    if (!existsSync(dir)) return;
    if (findSymlinks(dir).length) return keep(dir, "it holds a symbolic link");
    const left = listFiles(dir).filter((f) => !isGone(f));
    if (left.length) return keep(dir, `it also holds ${relative(dir, left[0] as string)}, which is not part of the move`);
    finish(dir);
  };

  const migrated: { slug: string; brand: Brand | null; paths: BrandPaths }[] = [];
  for (const slug of record.brands) {
    const p = pathsOf(o.workspace, o.data, slug);
    const old = join(o.workspace, "brand", slug);
    const parsed = existsSync(join(old, "brand.json")) ? readOldBrand(old) : null;
    let brand: Brand | null = parsed && "brand" in parsed ? parsed.brand : null;
    // What the move makes of the old brand.json and style.md, worked out before anything of this brand is removed.
    let expected: { brand: string | null; style: string | null } = { brand: null, style: null };
    let vm: VoiceMove | null = null;
    if (brand) {
      vm = voiceMove(old, brand, p);
      const w = identityWrites(old, slug, brand, p, vm);
      expected = { style: w.writes.find((x) => x.to === p.styleMd)?.content ?? null, brand: w.writes.find((x) => x.to === p.brandJson)?.content ?? null };
    }
    if (!brand) brand = readNew(p);
    migrated.push({ slug, brand, paths: p });

    take(join(old, "logo.png"), p.logo);
    take(join(old, "reel-questions.md"), p.questionsMd);
    if (vm) for (const c of vm.copies) take(c.from, c.to);
    takeIfEmptied(join(old, "voice")); // the first layout kept the sample in voice/; it goes when every file in it was copied and removed
    take(join(o.workspace, "reels", slug), p.reelsDir);
    take(join(o.workspace, "characters", slug), join(p.mascotDir, "studio"));
    if (brand?.character.enabled) {
      const id = brand.character.id, cf = characterFiles(p, id);
      take(join(o.workspace, "mascot", `${id}.py`), cf.script);
      take(join(o.workspace, "mascot", `${id}.blend`), cf.blend);
      take(join(o.workspace, "mascot", `${id}-expressions.png`), join(p.mascotDir, "studio", "reference-sheet.png"));
      take(join(o.workspace, "mascot", "work", "head.json"), cf.head);
    }
    takeRewritten(join(old, "brand.json"), p.brandJson, expected.brand);
    takeRewritten(join(old, "style.md"), p.styleMd, expected.style);
    if (existsSync(join(old, "voice-sample.md"))) keep(join(old, "voice-sample.md"), "the voice guide is now .claude/skills/reel/voice-sample.md; this copy may hold your own notes, so it is left for you to remove");
  }

  // What was shared by all brands in the first layout.
  const withCharacter = migrated.find((m) => m.brand?.character.enabled);
  if (withCharacter) take(join(o.workspace, "public", "mascot"), withCharacter.paths.movementsDir);
  for (const m of migrated) {
    for (const folder of dirs(m.paths.reelsDir)) {
      const pub = join(o.workspace, "public", folder);
      if (!existsSync(pub)) continue;
      if (findSymlinks(pub).length) { keep(pub, "it holds a symbolic link"); continue; }
      const entries = readdirSync(pub);
      const unknown = entries.filter((f) => !/^[A-Za-z0-9_]+\.wav$/.test(f) || !regularFile(join(pub, f)));
      if (unknown.length) { keep(pub, `it also holds ${unknown[0]}, which is not a final audio file`); continue; }
      const odd = entries.find((f) => !sameContent(join(pub, f), join(m.paths.reelsDir, folder, "audio", f)));
      if (odd) { keep(pub, `${odd} is not identical to the audio in the reel's folder`); continue; }
      finish(pub);
    }
  }
  const publicLogo = join(o.workspace, "public", "logo.png");
  if (existsSync(publicLogo)) {
    if (migrated.some((m) => sameContent(publicLogo, m.paths.logo))) finish(publicLogo);
    else keep(publicLogo, "it is not the logo of a moved brand");
  }
  // The program's own copies are compared with the program's: when the workspace IS the program folder there is no second copy, so nothing is touched.
  if (o.programRoot && resolve(o.programRoot) !== resolve(o.workspace)) {
    const sounds = join(o.programRoot, "sfx"), oldSounds = join(o.workspace, "public", "a1");
    if (existsSync(oldSounds)) {
      if (findSymlinks(oldSounds).length) keep(oldSounds, "it holds a symbolic link");
      else {
        const entries = readdirSync(oldSounds);
        const odd = entries.filter((f) => !regularFile(join(oldSounds, f)) || !sameContent(join(oldSounds, f), join(sounds, f)));
        if (odd.length) keep(oldSounds, `${odd.join(", ")} is not in the program's sfx/ folder (or differs)`);
        else finish(oldSounds);
      }
    }
    const tpl = join(o.workspace, "brand", "_template");
    if (existsSync(tpl)) {
      if (findSymlinks(tpl).length) keep(tpl, "it holds a symbolic link");
      else if (lacking(tpl, join(o.programRoot, "brand", "_template")).length) keep(tpl, "it differs from the template of the program");
      else finish(tpl);
    }
  }
  if (o.remove) for (const d of ["public", "mascot", "reels", "characters"]) pruneIfEmpty(join(o.workspace, d));
  return { removed, kept };
}

/** Reads a brand.json of the new layout (used when the old one is already gone). */
function readNew(p: BrandPaths): Brand | null {
  try { const v = validateBrand(JSON.parse(read(p.brandJson))); return v.ok ? v.brand : null; } catch { return null; }
}

/** Removes a folder that holds nothing but empty folders (a folder with a file or a link in it stays). */
function pruneIfEmpty(dir: string): void {
  if (existsSync(dir) && onlyEmptyDirs(dir)) rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// From <workspace>/brand/<slug>/{identity,mascot,reels} to <data>/brands/<slug>/ (one folder per brand, with the hub's data of the brand).

export const INTO_DATA_MARKER = ".reel-studio/brand-into-data.json";
const PARTS = ["mascot", "reels", "identity"] as const; // identity last: its brand.json is what makes the folder a brand

export interface IntoDataBrand { slug: string; parts: string[]; files: number; leftovers: string[] }
export interface IntoDataResult { status: "nothing" | "planned" | "applied" | "blocked"; brands: IntoDataBrand[]; problems: string[]; verified: boolean }

/** Brand folders still in the workspace: workspace/brand/<slug>/ with an identity, mascot or reels folder. */
export function findWorkspaceBrands(workspace: string): string[] {
  return dirs(join(workspace, "brand")).filter((n) => isValidSlug(n) && PARTS.some((p) => existsSync(join(workspace, "brand", n, p)))).sort();
}

/**
 * Moves each brand folder of the workspace into the data folder with a rename (same disk: instant, nothing is copied or duplicated), then makes the paths
 * in the brand's style guide relative to its folder. Refuses a part whose destination already has files. Other files in the old brand folder are left
 * and listed; the folder goes only when it is empty.
 */
export function moveBrandsIntoData(o: BrandFoldersOptions): IntoDataResult {
  const slugs = findWorkspaceBrands(o.workspace);
  if (slugs.length === 0) return { status: "nothing", brands: [], problems: [], verified: true };
  const problems: string[] = [];
  const brands: IntoDataBrand[] = slugs.map((slug) => {
    const from = join(o.workspace, "brand", slug), to = pathsOf(o.workspace, o.data, slug).brandDir;
    const parts = PARTS.filter((p) => existsSync(join(from, p)));
    for (const p of parts) if (existsSync(join(to, p)) && !onlyEmptyDirs(join(to, p))) problems.push(`${slug}: ${join(to, p)} already has files: nothing was moved for this brand`);
    const files = parts.reduce((n, p) => n + listFiles(join(from, p)).length, 0);
    const links = parts.flatMap((p) => findSymlinks(join(from, p)));
    if (links.length) problems.push(`${slug}: ${links[0]} is a symbolic link: move it by hand`);
    const leftovers = readdirSync(from).filter((n) => !(PARTS as readonly string[]).includes(n));
    return { slug, parts, files, leftovers };
  });
  if (!o.apply) return { status: "planned", brands, problems, verified: false };
  if (problems.length) return { status: "blocked", brands, problems, verified: false };

  const log = o.log ?? (() => undefined);
  const mistakes: string[] = [];
  const moved: string[] = [];
  for (const b of brands) {
    const from = join(o.workspace, "brand", b.slug), to = pathsOf(o.workspace, o.data, b.slug).brandDir;
    log(`${b.slug}: moving ${b.parts.join(", ")} (${b.files} files)`);
    let ok = true;
    for (const p of b.parts) {
      try {
        if (existsSync(join(to, p))) rmSync(join(to, p), { recursive: true, force: true }); // an empty folder (checked above)
        mkdirSync(to, { recursive: true });
        renameSync(join(from, p), join(to, p));
      } catch (e) {
        ok = false;
        mistakes.push(`${b.slug}: could not move ${p}: ${(e as NodeJS.ErrnoException).code === "EXDEV" ? "the workspace and the data folder are on different disks, so a rename is not possible" : (e as Error).message}`);
        break;
      }
    }
    const after = b.parts.reduce((n, p) => n + listFiles(join(to, p)).length, 0);
    if (ok && after !== b.files) mistakes.push(`${b.slug}: ${b.files} files before, ${after} after the move`);
    const style = join(to, "identity", "style.md");
    if (ok && existsSync(style)) { const md = read(style), next = relativeStyleGuide(md, b.slug); if (next !== md) writeFileSync(style, next); }
    if (ok && after === b.files) { moved.push(b.slug); try { rmdirSync(from); } catch { /* other files stay */ } }
  }
  try { rmdirSync(join(o.workspace, "brand")); } catch { /* not empty */ }
  const verified = mistakes.length === 0;
  mkdirSync(join(o.workspace, ".reel-studio"), { recursive: true });
  writeFileSync(join(o.workspace, INTO_DATA_MARKER), `${JSON.stringify({ at: new Date().toISOString(), verified, brands: moved, problems: mistakes }, null, 2)}\n`);
  return { status: "applied", brands, problems: mistakes, verified };
}
