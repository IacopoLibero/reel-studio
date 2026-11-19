import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** The project root: REEL_ROOT, else three levels above this file (platform/hub/src or platform/hub/dist). */
export const defaultRoot = (env: NodeJS.ProcessEnv = process.env): string => resolve(env.REEL_ROOT?.trim() || join(import.meta.dirname, "../../.."));

/** Where the hub keeps its state: HUB_DATA, else platform/data under the project root. */
export const defaultDataDir = (env: NodeJS.ProcessEnv = process.env): string => resolve(env.HUB_DATA?.trim() || join(defaultRoot(env), "platform/data"));

export const homeDir = (env: NodeJS.ProcessEnv = process.env): string => env.HOME?.trim() || homedir();
