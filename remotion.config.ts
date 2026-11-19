/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Config } from "@remotion/cli/config";

/**
 * The brand a render is made for: REEL_BRAND (the hub sets it for every job), else the first folder of brand/ that has
 * a brand.json, else the template. The kit imports it as "brand-theme" (src/kit/theme.ts).
 */
function brandFile(): string {
  const dir = join(process.cwd(), "brand");
  const has = (slug: string) => existsSync(join(dir, slug, "brand.json"));
  const named = process.env.REEL_BRAND?.trim();
  if (named && /^[a-z0-9_-]+$/.test(named) && has(named)) return join(dir, named, "brand.json");
  const first = existsSync(dir) ? readdirSync(dir).filter((n) => !n.startsWith("_") && !n.startsWith(".") && has(n)).sort()[0] : undefined;
  return join(dir, first ?? "_template", "brand.json");
}

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setDefaultPremountInSeconds(2);
Config.overrideBundlerConfig((config) => ({
  ...config,
  resolve: { ...config.resolve, alias: { ...(config.resolve?.alias as Record<string, string> | undefined), "brand-theme": brandFile() } },
}));
