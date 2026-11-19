import { join, resolve } from "node:path";
import { defaultDataDir, defaultRoot } from "../paths.js";
import { isValidSlug } from "./schema.js";

/** Where the browser profiles live: CHROME_PROFILE_ROOT, else the legacy CHROME_PROFILE, else /data/chrome-profile (the Docker volume). */
export const chromeProfileRoot = (env: NodeJS.ProcessEnv = process.env): string =>
  env.CHROME_PROFILE_ROOT?.trim() || env.CHROME_PROFILE?.trim() || "/data/chrome-profile";

export interface BrandPathOptions {
  root?: string;
  dataDir?: string;
  chromeRoot?: string;
  /** The brand's own profile folder when it is not <chromeRoot>/<slug> (brand.json: instagram.profileDir). */
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
  /** The Instagram browser profile of this brand. */
  profileDir: string;
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
    profileDir: o.profileDir ? resolve(o.profileDir) : join(o.chromeRoot ?? chromeProfileRoot(env), slug),
  };
}
