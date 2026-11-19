import type { BrandRegistry } from "./registry.js";
import type { BrandPaths } from "./paths.js";
import type { Brand } from "./schema.js";
import { join } from "node:path";

/** One brand with its paths: what every brand-scoped route, job and handler works with. */
export interface BrandCtx {
  slug: string;
  brand: Brand;
  paths: BrandPaths;
}

export function brandCtx(reg: BrandRegistry, slug: string): BrandCtx | null {
  const brand = reg.get(slug);
  return brand ? { slug, brand, paths: reg.paths(slug, brand) } : null;
}

/**
 * The folder of source texts (blog posts) the idea jobs read for a brand: brand.json sources.blogDir,
 * else sources/<slug> inside the project. Never another brand's folder.
 */
export const blogDirOf = (root: string, brand: Pick<Brand, "slug" | "sources">): string => brand.sources.blogDir?.trim() || join(root, "sources", brand.slug);
