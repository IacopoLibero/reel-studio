import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { brandSettingsSchema, globalSettingsSchema, DEFAULT_BRAND_SETTINGS } from "../settings.js";
import { chromeProfileRoot, brandPaths } from "./paths.js";
import { BrandRegistry, readBrand, writeBrand } from "./registry.js";
import { isValidSlug } from "./schema.js";
import { seedBrand } from "./seed.js";

export interface MigrateOptions {
  root: string;
  dataDir: string;
  env?: NodeJS.ProcessEnv;
  chromeRoot?: string;
  now?: Date;
  log?: (message: string) => void;
}

export interface MigrateResult {
  status: "migrated" | "already" | "nothing" | "no-brand";
  slug?: string;
  backup?: string;
  moved: string[];
  skipped: string[];
  jobsTagged: number;
}

/** What a single-brand release kept at the top of the data folder and what moves into data/brands/<slug>/ (jobs.json stays: it is the one queue, its records get a brand). */
const MOVES = ["scheduled.json", "daily", "analytics", "ideas", "series.json", "notifications.json", "locks"] as const;
const MARKER = ".brands-migrated.json";
const NO_BACKUP = new Set(["brands", "chrome-profile", "tmp", "dev-token", MARKER]);

const readJson = (f: string): unknown => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };
const stamp = (d: Date): string => d.toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");

function pickSlug(root: string, env: NodeJS.ProcessEnv): string | null {
  const named = env.BRAND?.trim();
  if (named && isValidSlug(named) && existsSync(join(root, "brand", named))) return named;
  try {
    return readdirSync(join(root, "brand"), { withFileTypes: true }).filter((d) => d.isDirectory() && isValidSlug(d.name)).map((d) => d.name).sort()[0] ?? null;
  } catch { return null; }
}

function hasLegacy(dataDir: string): boolean {
  if (MOVES.some((n) => existsSync(join(dataDir, n)))) return true;
  const settings = readJson(join(dataDir, "settings.json"));
  if (settings && typeof settings === "object" && ("factory" in settings || "daily" in settings || "slotPattern" in settings)) return true;
  const jobs = readJson(join(dataDir, "jobs.json"));
  return Array.isArray(jobs) && jobs.some((j) => j && typeof j === "object" && !("brand" in j));
}

/** Copies the whole data folder (not the Chrome profile, not earlier backups, not the dev token) to backup-pre-brands-<time>/. Reuses an existing backup. */
function backup(dataDir: string, now: Date, chromeRoot: string, log: (m: string) => void): string {
  const existing = readdirSync(dataDir).filter((n) => n.startsWith("backup-pre-brands-")).sort()[0];
  if (existing) { log(`backup already exists: ${existing}`); return join(dataDir, existing); }
  const dir = join(dataDir, `backup-pre-brands-${stamp(now)}`);
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dataDir)) {
    if (NO_BACKUP.has(name) || name.startsWith("backup-")) continue;
    cpSync(join(dataDir, name), join(dir, name), { recursive: true });
  }
  writeFileSync(join(dir, "NOTE.txt"), [
    "Copy of platform/data taken before the first start of the multi-brand release.",
    `The Instagram browser profile was NOT copied (it is large). It stays at ${chromeRoot} and is the profile of the migrated brand.`,
    "To go back: stop the hub, delete platform/data/brands and platform/data/.brands-migrated.json, copy these files back over platform/data, start the old release.",
    "",
  ].join("\n"));
  log(`backup written to ${dir}`);
  return dir;
}

function splitLegacySettings(dataDir: string, brandFile: string, log: (m: string) => void): void {
  const raw = readJson(join(dataDir, "settings.json"));
  if (!raw || typeof raw !== "object") return;
  const brand = brandSettingsSchema.safeParse({ ...DEFAULT_BRAND_SETTINGS, ...(raw as object) });
  if (!existsSync(brandFile)) {
    mkdirSync(join(brandFile, ".."), { recursive: true });
    writeFileSync(brandFile, JSON.stringify(brand.success ? brand.data : DEFAULT_BRAND_SETTINGS, null, 2));
    log(`brand settings written (${brand.success ? "from the old settings.json" : "defaults: the old file did not validate"})`);
  }
  const global = globalSettingsSchema.safeParse({ blenderDevice: "auto", claudeModel: "", ...(raw as object) });
  if (global.success) writeFileSync(join(dataDir, "settings.json"), JSON.stringify(global.data, null, 2));
}

/** Gives every job record without a brand the brand named in its params, else the migrated brand. Returns how many were tagged. */
function tagJobs(file: string, slug: string, known: (s: string) => boolean): number {
  const jobs = readJson(file);
  if (!Array.isArray(jobs)) return 0;
  let n = 0;
  const next = jobs.map((j: unknown) => {
    if (!j || typeof j !== "object" || "brand" in j) return j;
    const p = (j as { params?: { brand?: unknown } }).params?.brand;
    n += 1;
    return { ...(j as object), brand: typeof p === "string" && known(p) ? p : slug };
  });
  if (n) { writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 1)); renameSync(`${file}.tmp`, file); }
  return n;
}

/**
 * First start after the multi-brand release: backup, brand.json for the existing brand, per-brand data folder, settings split,
 * job records tagged. Idempotent (a marker file) and resumable (each step skips what is already done). Nothing is deleted.
 */
export function migrateLegacyData(o: MigrateOptions): MigrateResult {
  const env = o.env ?? process.env;
  const log = o.log ?? (() => undefined);
  const now = o.now ?? new Date();
  const chromeRoot = o.chromeRoot ?? chromeProfileRoot(env);
  const result: MigrateResult = { status: "nothing", moved: [], skipped: [], jobsTagged: 0 };
  if (!existsSync(o.dataDir)) return result;
  if (existsSync(join(o.dataDir, MARKER))) return { ...result, status: "already" };
  if (!hasLegacy(o.dataDir)) return result;

  const slug = pickSlug(o.root, env);
  if (!slug) { log("old data found but no brand folder in brand/: nothing migrated"); return { ...result, status: "no-brand" }; }
  log(`migrating the single-brand data to the brand "${slug}"`);
  const backupDir = backup(o.dataDir, now, chromeRoot, log);

  if (!readBrand(o.root, slug)) {
    const seeded = seedBrand({ root: o.root, slug, env });
    writeBrand(o.root, seeded);
    log(`brand/${slug}/brand.json written from style.md and the .env values`);
  }
  const brand = readBrand(o.root, slug);
  if (brand && !brand.instagram.profileDir && (existsSync(join(chromeRoot, "Default")) || existsSync(join(chromeRoot, "Local State")))) {
    writeBrand(o.root, { ...brand, instagram: { ...brand.instagram, profileDir: chromeRoot } });
    log(`the Instagram login stays where it is: ${chromeRoot} is now the profile of ${slug}`);
  }

  const p = brandPaths(slug, { root: o.root, dataDir: o.dataDir, chromeRoot });
  mkdirSync(p.dataDir, { recursive: true });
  for (const name of MOVES) {
    const from = join(o.dataDir, name);
    const to = join(p.dataDir, name);
    if (!existsSync(from)) continue;
    if (existsSync(to) && (statSync(to).isFile() || readdirSync(to).length > 0)) { result.skipped.push(name); log(`${name}: already in the brand folder, left in place`); continue; }
    if (existsSync(to)) mkdirSync(to, { recursive: true });
    renameSync(from, to);
    result.moved.push(name);
    log(`${name} moved to brands/${slug}/`);
  }
  splitLegacySettings(o.dataDir, p.settingsFile, log);
  const registry = new BrandRegistry({ root: o.root, dataDir: o.dataDir, chromeRoot });
  result.jobsTagged = tagJobs(join(o.dataDir, "jobs.json"), slug, (s) => registry.has(s));
  log(`${result.jobsTagged} job records tagged with a brand`);

  writeFileSync(join(o.dataDir, MARKER), JSON.stringify({ at: now.toISOString(), slug, backup: backupDir, moved: result.moved }, null, 2));
  appendFileSync(join(p.dataDir, "migration.log"), `${now.toISOString()} migrated from the single-brand layout; backup ${backupDir}; moved ${result.moved.join(", ") || "nothing"}\n`);
  return { ...result, status: "migrated", slug, backup: backupDir };
}
