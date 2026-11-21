import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { defaultDataDir } from "../paths.js";
import { isValidSlug } from "./schema.js";

/** The old shared browser-profile root from the environment (CHROME_PROFILE_ROOT, else the legacy CHROME_PROFILE), or null: with none, each brand's login lives in its own data folder. */
export const explicitChromeRoot = (env: NodeJS.ProcessEnv = process.env): string | null =>
  env.CHROME_PROFILE_ROOT?.trim() || env.CHROME_PROFILE?.trim() || null;

/** Where the old single-folder layout kept the browser profiles: CHROME_PROFILE_ROOT, else the legacy CHROME_PROFILE, else /data/chrome-profile (the Docker volume). Used only to migrate. */
export const chromeProfileRoot = (env: NodeJS.ProcessEnv = process.env): string =>
  env.CHROME_PROFILE_ROOT?.trim() || env.CHROME_PROFILE?.trim() || "/data/chrome-profile";

export interface BrandPathOptions {
  dataDir?: string;
  chromeRoot?: string | null;
  /** The brand's own profile folder (brand.json: instagram.profileDir). Without it: <chromeRoot>/<slug> when an old shared root is given, else <data>/brands/<slug>/profile. */
  profileDir?: string | null;
  env?: NodeJS.ProcessEnv;
}

export interface BrandPaths {
  slug: string;
  /**
   * The one folder of a brand: <data>/brands/<slug>/. Identity, character and reels are in it with everything the hub keeps for the brand
   * (settings, schedule, analytics, the question list, the Instagram login), so a brand is one folder to back up, move or delete.
   */
  brandDir: string;
  /** <brand>/identity/: brand.json, style.md, the logo, and the voice when the brand has no character. */
  identityDir: string;
  brandJson: string;
  styleMd: string;
  logo: string;
  /** <brand>/mascot/: the character's script, sheet, voice and its rendered moves. Absent for a brand without a character. */
  mascotDir: string;
  /** <brand>/mascot/movements/<move>/: the rendered PNG sequences (what Remotion reads as mascot/<move>/). */
  movementsDir: string;
  /** <brand>/reels/<n>-<name>/: one folder per reel, with its audio in audio/. */
  reelsDir: string;
  /** The same folder as brandDir (kept as its own field: it is what a job gets as its data folder). */
  dataDir: string;
  /** The question list (data/brands/<slug>/reel-questions.md): hub data, not part of the brand's identity. */
  questionsMd: string;
  settingsFile: string;
  scheduledFile: string;
  dailyDir: string;
  analyticsDir: string;
  ideasDir: string;
  seriesFile: string;
  locksDir: string;
  notificationsFile: string;
  /** The Instagram browser profile of this brand (its login). */
  profileDir: string;
}

/** The folder that holds every brand folder: <data>/brands. */
export const brandsDirOf = (dataDir: string): string => join(dataDir, "brands");

/** The question list of a brand lives in its data folder: data/brands/<slug>/reel-questions.md. */
export const questionsFile = (dataDir: string): string => join(dataDir, "reel-questions.md");

/** The files of a character inside <brand>/mascot/. (The reference sheet it was drawn from is in mascot/studio/, see studio.ts: nothing reads it at run time.) */
export interface CharacterFiles { script: string; blend: string; head: string }
export const characterFiles = (p: Pick<BrandPaths, "mascotDir">, id: string): CharacterFiles => ({
  script: join(p.mascotDir, `${id}.py`),
  blend: join(p.mascotDir, `${id}.blend`),
  head: join(p.mascotDir, `${id}-head.json`),
});

/** Where a brand's voice sample is stored: with the character when there is one (<id>-voice.*), else in identity/ (voice.*). Paths are relative to brand/<slug>/. */
export interface VoiceTarget { dir: string; wav: string; txt: string; settings: string; relWav: string; relTxt: string }
export function voiceTarget(p: Pick<BrandPaths, "identityDir" | "mascotDir">, character: { enabled: boolean; id: string }): VoiceTarget {
  const own = character.enabled;
  const dir = own ? p.mascotDir : p.identityDir;
  const stem = own ? `${character.id}-voice` : "voice";
  const rel = own ? "mascot" : "identity";
  return { dir, wav: join(dir, `${stem}.wav`), txt: join(dir, `${stem}.txt`), settings: join(dir, `${stem}.json`), relWav: `${rel}/${stem}.wav`, relTxt: `${rel}/${stem}.txt` };
}

/** The paths brand.json stores for the voice sample (relative to brand/<slug>/): the same as voiceTarget gives, without needing the folders. */
export const voiceRelPaths = (character: { enabled: boolean; id: string }): { sample: string; sampleText: string } => {
  const t = voiceTarget({ identityDir: "", mascotDir: "" }, character);
  return { sample: t.relWav, sampleText: t.relTxt };
};

/** A brand's login lives in its data folder; an install that still has it in the old shared profile folder (and none yet in the new place) keeps working. */
function defaultProfile(fresh: string, slug: string, env: NodeJS.ProcessEnv): string {
  const old = join(chromeProfileRoot(env), slug);
  return !existsSync(fresh) && existsSync(old) ? old : fresh;
}

/** Every path of one brand. Throws on a slug that is not safe to put in a path. */
export function brandPaths(slug: string, o: BrandPathOptions = {}): BrandPaths {
  if (!isValidSlug(slug) && slug !== "_template") throw new Error(`Invalid brand slug "${slug}"`);
  const env = o.env ?? process.env;
  const data = join(o.dataDir ?? defaultDataDir(env), "brands", slug);
  const brandDir = data;
  const identityDir = join(brandDir, "identity");
  return {
    slug, brandDir, identityDir,
    brandJson: join(identityDir, "brand.json"), styleMd: join(identityDir, "style.md"), logo: join(identityDir, "logo.png"),
    mascotDir: join(brandDir, "mascot"), movementsDir: join(brandDir, "mascot", "movements"),
    reelsDir: join(brandDir, "reels"),
    questionsMd: questionsFile(data),
    dataDir: data, settingsFile: join(data, "settings.json"), scheduledFile: join(data, "scheduled.json"),
    dailyDir: join(data, "daily"), analyticsDir: join(data, "analytics"), ideasDir: join(data, "ideas"),
    seriesFile: join(data, "series.json"), locksDir: join(data, "locks"), notificationsFile: join(data, "notifications.json"),
    profileDir: o.profileDir ? resolve(o.profileDir) : o.chromeRoot ? join(o.chromeRoot, slug) : defaultProfile(join(data, "profile"), slug, env),
  };
}
