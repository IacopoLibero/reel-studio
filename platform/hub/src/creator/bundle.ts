import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { defaultBrandValues, uniqueSlug, validateBrand, type Brand } from "../brands/schema.js";
import { checkFile, FileError } from "./files.js";
import { UPLOAD_ID } from "./uploads.js";

/** A brand folder handed over as files (a zip, or a folder picked in the browser). */
export interface BundleFile { path: string; data: Buffer }
export class BundleError extends Error {}

export const BUNDLE_LIMITS = { files: 300, fileBytes: 25_000_000, totalBytes: 40_000_000, jsonBytes: 100_000, textBytes: 100_000 } as const;

/** A clean relative path: no drive, no leading slash, no "." or ".." parts, no backslash or control characters. */
export function cleanPath(raw: string): string {
  if (!raw || /[\\\u0000-\u001f:]/.test(raw) || raw.startsWith("/")) throw new BundleError(`The path "${raw.replace(/[\u0000-\u001f]/g, "?")}" is not allowed.`);
  const parts = raw.split("/").filter((p) => p !== "");
  if (parts.length === 0 || parts.some((p) => p === "." || p === ".." || p.length > 120)) throw new BundleError(`The path "${raw}" is not allowed.`);
  return parts.join("/");
}

const IDENTITY_FILE = /^identity\/(brand\.json|style\.md|logo\.png|voice\.(wav|txt|json))$/;

/** The files of the identity folder of a brand (brand/<slug>/identity/) are read as if they sat at the top: "identity/brand.json" becomes "brand.json". The identity folder wins over a loose file of the same name. */
function flattenIdentity(files: Map<string, Buffer>): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  for (const [path, data] of files) if (!IDENTITY_FILE.test(path)) out.set(path, data);
  for (const [path, data] of files) if (IDENTITY_FILE.test(path)) out.set(path.slice("identity/".length), data);
  return out;
}

/** Cleans every path, refuses duplicates and oversized input, and drops a single wrapping folder ("my-brand/identity/brand.json" becomes "brand.json"). */
export function normalizeBundle(files: BundleFile[]): Map<string, Buffer> {
  if (files.length === 0) throw new BundleError("The folder is empty.");
  if (files.length > BUNDLE_LIMITS.files) throw new BundleError(`Too many files (the limit is ${BUNDLE_LIMITS.files}).`);
  let total = 0;
  const cleaned = files.map((f) => {
    if (f.data.length > BUNDLE_LIMITS.fileBytes) throw new BundleError(`"${f.path}" is too big (the limit is ${BUNDLE_LIMITS.fileBytes / 1_000_000} MB per file).`);
    total += f.data.length;
    return { path: cleanPath(f.path), data: f.data };
  });
  if (total > BUNDLE_LIMITS.totalBytes) throw new BundleError(`The folder is too big (the limit is ${BUNDLE_LIMITS.totalBytes / 1_000_000} MB).`);
  const firsts = new Set(cleaned.map((f) => f.path.split("/")[0]));
  const strip = !cleaned.some((f) => f.path === "brand.json" || f.path === "identity/brand.json") && firsts.size === 1 && cleaned.every((f) => f.path.includes("/"));
  const out = new Map<string, Buffer>();
  const seen = new Set<string>();
  for (const f of cleaned) {
    const path = strip ? f.path.split("/").slice(1).join("/") : f.path;
    if (seen.has(path.toLowerCase())) throw new BundleError(`The file "${path}" appears twice.`);
    seen.add(path.toLowerCase());
    out.set(path, f.data);
  }
  return flattenIdentity(out);
}

export interface BundlePreview {
  brand: Brand;
  styleMd: boolean;
  questions: boolean;
  logo: "png" | null;
  voice: boolean;
  warnings: string[];
}

const keep = (path: string): boolean => /^(brand\.json|style\.md|reel-questions\.md|logo\.png|voice\.(wav|txt)|voice\/[A-Za-z0-9._-]+\.(wav|txt)|mascot\/[a-z][a-z0-9_-]*-voice\.(wav|txt))$/.test(path);

/** The voice sample of a folder as ["voice.wav", "voice.txt"] bytes: identity voice first, then the character's voice, then an old voice/ folder (the one brand.json names). */
function findVoice(files: Map<string, Buffer>, named: string | null): { wav: Buffer; txt: Buffer | null } | null {
  const wavPath = files.has("voice.wav") ? "voice.wav"
    : [...files.keys()].find((p) => /^mascot\/[a-z][a-z0-9_-]*-voice\.wav$/.test(p))
      ?? (named && /^voice\/[A-Za-z0-9._-]+\.wav$/.test(named) && files.has(named) ? named : undefined);
  const wav = wavPath ? files.get(wavPath) : undefined;
  if (!wavPath || !wav) return null;
  const txt = files.get(wavPath.replace(/\.wav$/, ".txt")) ?? (named && files.has(named.replace(/\.wav$/, ".txt")) ? files.get(named.replace(/\.wav$/, ".txt")) : undefined) ?? null;
  return { wav, txt };
}

export interface InspectOptions { takenSlugs: Iterable<string>; hasMascot?: (id: string) => boolean }

/** Validates the folder as a brand. The slug is never allowed to clash: a taken or unusable slug is replaced and reported. */
export function inspectBundle(files: Map<string, Buffer>, o: InspectOptions): { preview: BundlePreview; kept: Map<string, Buffer> } {
  const json = files.get("brand.json");
  if (!json) throw new BundleError("There is no brand.json at the top of the folder.");
  if (json.length > BUNDLE_LIMITS.jsonBytes) throw new BundleError("brand.json is too big.");
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(json.toString("utf8")) as Record<string, unknown>; } catch { throw new BundleError("brand.json is not valid JSON."); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new BundleError("brand.json must hold one object.");
  const warnings: string[] = [];
  const taken = new Set(o.takenSlugs);
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Imported brand";
  const wanted = typeof raw.slug === "string" ? raw.slug : "";
  let slug = wanted;
  if (!wanted || taken.has(wanted) || !validateBrand({ ...defaultBrandValues(wanted || "x", name), slug: wanted }).ok) {
    slug = uniqueSlug(wanted || name, taken);
    warnings.push(taken.has(wanted) ? `The slug "${wanted}" already exists here, so this brand gets "${slug}". Nothing existing is touched.` : `The slug in brand.json was not usable, so this brand gets "${slug}".`);
  }
  const candidate = { ...raw, slug };
  const v = validateBrand(candidate);
  if (!v.ok) throw new BundleError(`brand.json is not valid: ${v.errors.join("; ")}`);
  let brand = v.brand;
  if (brand.instagram.profileDir) { brand = { ...brand, instagram: { ...brand.instagram, profileDir: null } }; warnings.push("The Instagram profile folder of the other machine was dropped. Log in again on the Instagram page."); }
  if (brand.sources.blogDir) { brand = { ...brand, sources: { blogDir: null } }; warnings.push("The folder of source texts belongs to the other machine and was dropped."); }
  if (brand.character.enabled && !(o.hasMascot?.(brand.character.id) ?? false)) {
    brand = { ...brand, character: { ...brand.character, enabled: false } };
    warnings.push(`The character "${brand.character.id}" is not set up on this machine, so the brand starts without a character.`);
  }
  const kept = new Map<string, Buffer>();
  const skipped: string[] = [];
  for (const [path, data] of files) {
    if (!keep(path)) { skipped.push(path); continue; }
    if (path === "brand.json") continue;
    if (/\.(md|txt)$/.test(path) && data.length > BUNDLE_LIMITS.textBytes) throw new BundleError(`"${path}" is too big for a text file.`);
    try {
      if (path.startsWith("logo.")) checkFile("logo", data);
      if (path.endsWith(".wav")) checkFile("voice", data);
    } catch (e) { throw new BundleError(`"${path}": ${(e as FileError).message}`); }
    if (path.startsWith("voice") || path.startsWith("mascot/")) continue; // the voice files are picked below and kept as voice.wav / voice.txt
    kept.set(path, data);
  }
  if (skipped.length) warnings.push(`Not imported (only brand.json, style.md, reel-questions.md, the logo and the voice files are): ${skipped.slice(0, 6).join(", ")}${skipped.length > 6 ? ` and ${skipped.length - 6} more` : ""}.`);
  const logo = kept.has("logo.png") ? "png" : null;
  const found = findVoice(files, brand.voice.sample);
  if (found) {
    try { checkFile("voice", found.wav); } catch (e) { throw new BundleError(`The voice sample: ${(e as FileError).message}`); }
    if (found.txt && found.txt.length > BUNDLE_LIMITS.textBytes) throw new BundleError("The text of the voice sample is too big for a text file.");
    kept.set("voice.wav", found.wav);
    if (found.txt) kept.set("voice.txt", found.txt);
  }
  const voice = !!found && !!found.txt;
  if (brand.voice.sample && !voice) warnings.push("brand.json names a voice sample, but the folder has no usable sample with its text: the voice is set to decide later.");
  const clean = voice ? brand : { ...brand, voice: { ...brand.voice, sample: null, sampleText: null } };
  if (!voice) { kept.delete("voice.wav"); kept.delete("voice.txt"); }
  return { preview: { brand: clean, styleMd: kept.has("style.md"), questions: kept.has("reel-questions.md"), logo, voice, warnings }, kept };
}

/** Writes the kept files to <dir>/<id>/ (the job reads them from there) and returns the id. */
export function stageBundle(dir: string, kept: Map<string, Buffer>): string {
  const id = randomBytes(16).toString("hex");
  const base = join(dir, `${id}.bundle.dir`);
  try {
    for (const [path, data] of kept) { const f = join(base, path); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, data); }
    mkdirSync(base, { recursive: true });
  } catch (e) { rmSync(base, { recursive: true, force: true }); throw e; }
  return id;
}

export function bundleDir(dir: string, id: string): string | null {
  if (!UPLOAD_ID.test(id)) return null;
  const p = join(dir, `${id}.bundle.dir`);
  return existsSync(p) ? p : null;
}
