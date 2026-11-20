import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { defaultDataDir, defaultRoot } from "../paths.js";
import { brandPaths, explicitChromeRoot, type BrandPathOptions, type BrandPaths } from "./paths.js";
import { brandSchema, isValidSlug, validateBrand, type Brand } from "./schema.js";
import { fillTemplate } from "./template.js";

export interface RegistryOptions { root?: string; dataDir?: string; chromeRoot?: string; env?: NodeJS.ProcessEnv }

const SKELETON = "## To do\n\n## Done\n";

/** Brand folders that hold a valid brand.json, found in <root>/brand (the template and hidden folders are skipped). */
export function listBrandSlugs(root: string): string[] {
  try {
    return readdirSync(join(root, "brand"), { withFileTypes: true })
      .filter((d) => d.isDirectory() && isValidSlug(d.name) && existsSync(join(root, "brand", d.name, "brand.json")))
      .map((d) => d.name).sort();
  } catch { return []; }
}

/** Reads and validates brand/<slug>/brand.json. Null when it is missing or invalid (the reason is in `readBrandFile`). */
export function readBrand(root: string, slug: string): Brand | null {
  const r = readBrandFile(root, slug);
  return r.ok ? r.brand : null;
}

export function readBrandFile(root: string, slug: string): ReturnType<typeof validateBrand> {
  if (!isValidSlug(slug)) return { ok: false, errors: [`slug: "${slug}" is not a valid brand slug`] };
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(join(root, "brand", slug, "brand.json"), "utf8")); } catch (e) {
    return { ok: false, errors: [`brand.json: ${(e as NodeJS.ErrnoException).code === "ENOENT" ? "not found" : "is not valid JSON"}`] };
  }
  const v = validateBrand(raw);
  if (v.ok && v.brand.slug !== slug) return { ok: false, errors: [`slug: brand.json says "${v.brand.slug}" but the folder is "${slug}"`] };
  return v;
}

/** Writes brand.json atomically (validated first). */
export function writeBrand(root: string, brand: Brand): void {
  const parsed = brandSchema.parse(brand);
  const file = join(root, "brand", parsed.slug, "brand.json");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, `${JSON.stringify(parsed, null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
}

/**
 * The brands of this machine and everything that depends on them: paths, the default brand, folder creation.
 * Cheap to call: brand.json is read on demand, so a brand created or edited by hand shows up without a restart.
 */
export class BrandRegistry {
  readonly root: string;
  readonly dataDir: string;
  readonly chromeRoot: string | null;

  constructor(o: RegistryOptions = {}) {
    const env = o.env ?? process.env;
    this.root = o.root ?? defaultRoot(env);
    this.dataDir = o.dataDir ?? defaultDataDir(env);
    this.chromeRoot = o.chromeRoot ?? explicitChromeRoot(env);
  }

  slugs(): string[] { return listBrandSlugs(this.root); }
  list(): Brand[] { return this.slugs().map((s) => readBrand(this.root, s)).filter((b): b is Brand => b !== null); }
  get(slug: string): Brand | null { return readBrand(this.root, slug); }
  has(slug: string): boolean { return this.get(slug) !== null; }

  /** The brand used when a request names none: the first one by slug. Null when the machine has no brand yet. */
  defaultSlug(): string | null { return this.list()[0]?.slug ?? null; }

  paths(slug: string, brand: Brand | null = this.get(slug)): BrandPaths {
    const opts: BrandPathOptions = { root: this.root, dataDir: this.dataDir, chromeRoot: this.chromeRoot, profileDir: brand?.instagram.profileDir ?? null };
    return brandPaths(slug, opts);
  }

  /**
   * Creates everything a brand needs and writes brand.json. Never overwrites: a file that exists stays as it is,
   * and a slug that already has a brand.json is refused. Files of brand/_template are copied for the ones the brand does not have.
   */
  create(input: unknown): { brand: Brand; paths: BrandPaths; created: string[] } {
    const v = validateBrand(input);
    if (!v.ok) throw new BrandError(v.errors.join("; "));
    const brand = v.brand;
    if (existsSync(join(this.root, "brand", brand.slug, "brand.json"))) throw new BrandError(`The brand "${brand.slug}" already exists.`);
    const p = this.paths(brand.slug, brand);
    const created: string[] = [];
    const ensureDir = (d: string) => { if (!existsSync(d)) { mkdirSync(d, { recursive: true }); created.push(d); } };
    ensureDir(p.brandDir);
    const tpl = join(this.root, "brand", "_template");
    if (existsSync(tpl)) {
      for (const name of readdirSync(tpl)) {
        if (name === "brand.json" || name === "README.md") continue;
        const dest = join(p.brandDir, name);
        if (existsSync(dest)) continue;
        cpSync(join(tpl, name), dest, { recursive: true });
        if (name.endsWith(".md") && statSync(dest).isFile()) writeFileSync(dest, fillTemplate(readFileSync(dest, "utf8"), brand));
        created.push(dest);
      }
    }
    if (!existsSync(p.questionsMd)) { writeFileSync(p.questionsMd, `# Reel questions: ${brand.name}\n\n${SKELETON}`); created.push(p.questionsMd); }
    for (const d of [p.voiceDir, p.reelsDir, p.dataDir, p.dailyDir, p.analyticsDir, p.ideasDir, p.locksDir, p.shotsDir]) ensureDir(d);
    try { ensureDir(p.profileDir); } catch { /* the profile root (/data/...) exists only inside the container; the scheduler creates it on first use */ }
    writeBrand(this.root, brand);
    created.push(p.brandJson);
    return { brand, paths: p, created };
  }
}

export class BrandError extends Error {
  constructor(message: string, readonly status = 400) { super(message); this.name = "BrandError"; }
}
