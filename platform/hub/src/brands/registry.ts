import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { defaultDataDir, defaultProgramRoot, defaultRoot } from "../paths.js";
import { brandPaths, type BrandPathOptions, type BrandPaths } from "./paths.js";
import { brandSchema, isValidSlug, validateBrand, type Brand } from "./schema.js";
import { fillTemplate } from "./template.js";

export interface RegistryOptions { root?: string; dataDir?: string; /** The program folder, where brand/_template lives (default: the folder this program runs from). */ programRoot?: string; env?: NodeJS.ProcessEnv }

const SKELETON = "## To do\n\n## Done\n";

/** Brand folders that hold an identity/brand.json, found in <data>/brands (hidden folders are skipped). */
export function listBrandSlugs(dataDir: string): string[] {
  try {
    return readdirSync(join(dataDir, "brands"), { withFileTypes: true })
      .filter((d) => d.isDirectory() && isValidSlug(d.name) && existsSync(join(dataDir, "brands", d.name, "identity", "brand.json")))
      .map((d) => d.name).sort();
  } catch { return []; }
}

/** Reads and validates <data>/brands/<slug>/identity/brand.json. Null when it is missing or invalid (the reason is in `readBrandFile`). */
export function readBrand(dataDir: string, slug: string): Brand | null {
  const r = readBrandFile(dataDir, slug);
  return r.ok ? r.brand : null;
}

export function readBrandFile(dataDir: string, slug: string): ReturnType<typeof validateBrand> {
  if (!isValidSlug(slug)) return { ok: false, errors: [`slug: "${slug}" is not a valid brand slug`] };
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(join(dataDir, "brands", slug, "identity", "brand.json"), "utf8")); } catch (e) {
    return { ok: false, errors: [`brand.json: ${(e as NodeJS.ErrnoException).code === "ENOENT" ? "not found" : "is not valid JSON"}`] };
  }
  const v = validateBrand(raw);
  if (v.ok && v.brand.slug !== slug) return { ok: false, errors: [`slug: brand.json says "${v.brand.slug}" but the folder is "${slug}"`] };
  return v;
}

/** Writes brand.json atomically (validated first). */
export function writeBrand(dataDir: string, brand: Brand): void {
  const parsed = brandSchema.parse(brand);
  const file = join(dataDir, "brands", parsed.slug, "identity", "brand.json");
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
  /** brand/_template inside the program folder: the starting files of a new brand. */
  readonly templateDir: string;

  constructor(o: RegistryOptions = {}) {
    const env = o.env ?? process.env;
    this.root = o.root ?? defaultRoot(env);
    this.dataDir = o.dataDir ?? defaultDataDir(env);
    this.templateDir = join(o.programRoot ?? defaultProgramRoot(), "brand", "_template");
  }

  slugs(): string[] { return listBrandSlugs(this.dataDir); }
  list(): Brand[] { return this.slugs().map((s) => readBrand(this.dataDir, s)).filter((b): b is Brand => b !== null); }
  get(slug: string): Brand | null { return readBrand(this.dataDir, slug); }
  has(slug: string): boolean { return this.get(slug) !== null; }

  /** The brand used when a request names none: the first one by slug. Null when the machine has no brand yet. */
  defaultSlug(): string | null { return this.list()[0]?.slug ?? null; }

  paths(slug: string): BrandPaths {
    const opts: BrandPathOptions = { dataDir: this.dataDir };
    return brandPaths(slug, opts);
  }

  /**
   * Creates everything a brand needs and writes brand.json. Never overwrites: a file that exists stays as it is,
   * and a slug that already has a brand.json is refused. The program's brand/_template/style.md becomes identity/style.md.
   * The character folder (mascot/) is not made here: the creator makes it when the brand has a character.
   */
  create(input: unknown): { brand: Brand; paths: BrandPaths; created: string[] } {
    const v = validateBrand(input);
    if (!v.ok) throw new BrandError(v.errors.join("; "));
    const brand = v.brand;
    const p = this.paths(brand.slug);
    if (existsSync(p.brandJson)) throw new BrandError(`The brand "${brand.slug}" already exists.`);
    const created: string[] = [];
    const ensureDir = (d: string) => { if (!existsSync(d)) { mkdirSync(d, { recursive: true }); created.push(d); } };
    for (const d of [p.brandDir, p.identityDir, p.reelsDir, p.dataDir, p.dailyDir, p.analyticsDir, p.ideasDir, p.locksDir]) ensureDir(d);
    const style = join(this.templateDir, "style.md");
    if (existsSync(style) && !existsSync(p.styleMd)) {
      writeFileSync(p.styleMd, fillTemplate(readFileSync(style, "utf8"), brand));
      created.push(p.styleMd);
    }
    if (!existsSync(p.questionsMd)) { writeFileSync(p.questionsMd, `# Reel questions: ${brand.name}\n\n${SKELETON}`); created.push(p.questionsMd); }
    try { ensureDir(p.profileDir); } catch { /* the scheduler creates it on first use */ }
    writeBrand(this.dataDir, brand);
    created.push(p.brandJson);
    return { brand, paths: p, created };
  }
}

export class BrandError extends Error {
  constructor(message: string, readonly status = 400) { super(message); this.name = "BrandError"; }
}
