import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { BrandRegistry } from "../../src/brands/registry.js";
import { brandCtx, type BrandCtx } from "../../src/brands/context.js";
import { defaultBrandValues, validateBrand, type Brand, type BrandInput } from "../../src/brands/schema.js";

/** A valid brand for tests: neutral values, overridable. */
export function testBrand(slug = "acme", over: Partial<BrandInput> = {}): Brand {
  const v = validateBrand({ ...defaultBrandValues(slug, over.name ?? "Acme"), ...over, slug });
  if (!v.ok) throw new Error(v.errors.join("; "));
  return v.brand;
}

/**
 * Writes <data>/brands/<slug>/identity/brand.json, and the question list in the same brand folder when `questions` is given.
 * The data folder is `dataDir`, else the `data` folder next to `root` (the layout most tests use: <tmp>/root and <tmp>/data).
 */
export function writeTestBrand(root: string, slug = "acme", over: Partial<BrandInput> = {}, questions?: string, dataDir?: string): Brand {
  const brand = testBrand(slug, over);
  const brandDir = join(dataDir ?? join(dirname(root), "data"), "brands", slug);
  mkdirSync(join(brandDir, "identity"), { recursive: true });
  writeFileSync(join(brandDir, "identity", "brand.json"), JSON.stringify(brand, null, 2));
  if (questions !== undefined) writeFileSync(join(brandDir, "reel-questions.md"), questions);
  return brand;
}

/** A registry on a temp root and data folder, with one brand written. */
export function testRegistry(root: string, data: string, slug = "acme", over: Partial<BrandInput> = {}, questions?: string): { reg: BrandRegistry; ctx: BrandCtx } {
  writeTestBrand(root, slug, over, questions, data);
  const reg = new BrandRegistry({ root, dataDir: data, chromeRoot: join(data, "chrome"), programRoot: root });
  mkdirSync(reg.paths(slug).dataDir, { recursive: true });
  return { reg, ctx: brandCtx(reg, slug) as BrandCtx };
}
