import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** The program folder: three levels above this file (platform/hub/src or platform/hub/dist). Where the shipped files are. */
export const defaultProgramRoot = (): string => resolve(join(import.meta.dirname, "../../.."));

export const homeDir = (env: NodeJS.ProcessEnv = process.env): string => env.HOME?.trim() || homedir();

/** The user's studio folder (workspace and data): REEL_STUDIO_HOME, else ~/ReelStudio. */
export const studioHome = (env: NodeJS.ProcessEnv = process.env): string => resolve(env.REEL_STUDIO_HOME?.trim() || join(homeDir(env), "ReelStudio"));

/**
 * The workspace (brands, reels, the Remotion project): REEL_ROOT, else <REEL_STUDIO_HOME>/workspace when REEL_STUDIO_HOME is set,
 * else the program folder (the old layout, where everything sits in the project folder).
 */
export const defaultRoot = (env: NodeJS.ProcessEnv = process.env): string =>
  resolve(env.REEL_ROOT?.trim() || (env.REEL_STUDIO_HOME?.trim() ? join(studioHome(env), "workspace") : defaultProgramRoot()));

/** Where the hub keeps its state: HUB_DATA, else <REEL_STUDIO_HOME>/data when REEL_STUDIO_HOME is set, else platform/data under the root. */
export const defaultDataDir = (env: NodeJS.ProcessEnv = process.env): string =>
  resolve(env.HUB_DATA?.trim() || (env.REEL_STUDIO_HOME?.trim() ? join(studioHome(env), "data") : join(defaultRoot(env), "platform/data")));
