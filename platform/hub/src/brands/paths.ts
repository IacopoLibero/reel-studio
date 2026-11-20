import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { defaultDataDir, defaultRoot } from "../paths.js";
import { isValidSlug } from "./schema.js";

/** The old shared browser-profile root from the environment (CHROME_PROFILE_ROOT, else the legacy CHROME_PROFILE), or null: with none, each brand's login lives in its own data folder. */
export const explicitChromeRoot = (env: NodeJS.ProcessEnv = process.env): string | null =>
  env.CHROME_PROFILE_ROOT?.trim() || env.CHROME_PROFILE?.trim() || null;

/** Where the old single-folder layout kept the browser profiles: CHROME_PROFILE_ROOT, else the legacy CHROME_PROFILE, else /data/chrome-profile (the Docker volume). Used only to migrate. */
export const chromeProfileRoot = (env: NodeJS.ProcessEnv = process.env): string =>
  env.CHROME_PROFILE_ROOT?.trim() || env.CHROME_PROFILE?.trim() || "/data/chrome-profile";

export interface BrandPathOptions {
  root?: string;
  dataDir?: string;
  chromeRoot?: string | null;
  /** The brand's own profile folder (brand.json: instagram.profileDir). Without it: <chromeRoot>/<slug> when an old shared root is given, else <data>/brands/<slug>/profile. */
  profileDir?: string | null;
  env?: NodeJS.ProcessEnv;
}

export interface BrandPaths {
  slug: string;
  /** brand/<slug>/ in the project (private, git-ignored except _template). */
  brandDir: string;
  brandJson: string;
  styleMd: string;
  questionsMd: string;
  logo: string;
  voiceDir: string;
  /** reels/<slug>/ */
  reelsDir: string;
  /** platform/data/brands/<slug>/: everything the hub stores for this brand. */
  dataDir: string;
  settingsFile: string;
  scheduledFile: string;
  dailyDir: string;
  analyticsDir: string;
  ideasDir: string;
  seriesFile: string;
  locksDir: string;
  notificationsFile: string;
  shotsDir: string;
  /** The Instagram browser profile of this brand (its login). */
  profileDir: string;
}

/** A brand's login lives in its data folder; an install that still has it in the old shared profile folder (and none yet in the new place) keeps working. */
function defaultProfile(fresh: string, slug: string, env: NodeJS.ProcessEnv): string {
  const old = join(chromeProfileRoot(env), slug);
  return !existsSync(fresh) && existsSync(old) ? old : fresh;
}

/** Every path of one brand. Throws on a slug that is not safe to put in a path. */
export function brandPaths(slug: string, o: BrandPathOptions = {}): BrandPaths {
  if (!isValidSlug(slug) && slug !== "_template") throw new Error(`Invalid brand slug "${slug}"`);
  const env = o.env ?? process.env;
  const root = o.root ?? defaultRoot(env);
  const data = join(o.dataDir ?? defaultDataDir(env), "brands", slug);
  const brandDir = join(root, "brand", slug);
  return {
    slug, brandDir,
    brandJson: join(brandDir, "brand.json"), styleMd: join(brandDir, "style.md"), questionsMd: join(brandDir, "reel-questions.md"),
    logo: join(brandDir, "logo.png"), voiceDir: join(brandDir, "voice"),
    reelsDir: join(root, "reels", slug),
    dataDir: data, settingsFile: join(data, "settings.json"), scheduledFile: join(data, "scheduled.json"),
    dailyDir: join(data, "daily"), analyticsDir: join(data, "analytics"), ideasDir: join(data, "ideas"),
    seriesFile: join(data, "series.json"), locksDir: join(data, "locks"), notificationsFile: join(data, "notifications.json"),
    shotsDir: join(data, "shots"),
    profileDir: o.profileDir ? resolve(o.profileDir) : o.chromeRoot ? join(o.chromeRoot, slug) : defaultProfile(join(data, "profile"), slug, env),
  };
}
