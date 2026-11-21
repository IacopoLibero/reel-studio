/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";
import { pickBrand, removeStage, removeStaleStages, stagePublic, themeFile } from "./scripts/brand-public";

/**
 * The brand a render is made for: REEL_BRAND (the hub sets it for every job), else the first brand with an identity/brand.json.
 * The kit imports its brand.json as "brand-theme" (src/kit/theme.ts), and Remotion's public folder is built for that brand:
 * its logo, its character's moves, the common sounds and the audio of its reels (see scripts/brand-public.ts).
 */
const workspace = process.cwd();
const slug = pickBrand(workspace);

removeStaleStages(workspace);
const publicDir = stagePublic(workspace, slug);
process.on("exit", () => removeStage(publicDir));

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setDefaultPremountInSeconds(2);
Config.setPublicDir(publicDir);
Config.overrideBundlerConfig((config) => ({
  ...config,
  resolve: { ...config.resolve, alias: { ...(config.resolve?.alias as Record<string, string> | undefined), "brand-theme": themeFile(workspace, slug) } },
}));
