import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BrandRegistry } from "../../src/brands/registry.js";
import { brandCtx, type BrandCtx } from "../../src/brands/context.js";
import { defaultBrandValues, validateBrand, type Brand, type BrandInput } from "../../src/brands/schema.js";

/** A valid brand for tests: neutral values, overridable. */
export function testBrand(slug = "acme", over: Partial<BrandInput> = {}): Brand {
  const v = validateBrand({ ...defaultBrandValues(slug, over.name ?? "Acme"), ...over, slug });
  if (!v.ok) throw new Error(v.errors.join("; "));
  return v.brand;
}

/** Writes brand/<slug>/brand.json (and an empty reel-questions.md when `questions` is given) under `root`. */
export function writeTestBrand(root: string, slug = "acme", over: Partial<BrandInput> = {}, questions?: string): Brand {
  const brand = testBrand(slug, over);
  const dir = join(root, "brand", slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "brand.json"), JSON.stringify(brand, null, 2));
  if (questions !== undefined) writeFileSync(join(dir, "reel-questions.md"), questions);
  return brand;
}

/** A registry on a temp root and data folder, with one brand written. */
export function testRegistry(root: string, data: string, slug = "acme", over: Partial<BrandInput> = {}, questions?: string): { reg: BrandRegistry; ctx: BrandCtx } {
  writeTestBrand(root, slug, over, questions);
  const reg = new BrandRegistry({ root, dataDir: data, chromeRoot: join(data, "chrome") });
  mkdirSync(reg.paths(slug).dataDir, { recursive: true });
  return { reg, ctx: brandCtx(reg, slug) as BrandCtx };
}
