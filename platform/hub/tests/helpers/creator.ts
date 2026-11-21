import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrandRegistry } from "../../src/brands/registry.js";
import type { HandlerCtx } from "../../src/jobs/handlers.js";
import type { CreatorServices } from "../../src/creator/services.js";
import { UploadStore } from "../../src/creator/uploads.js";
import { DEFAULT_SETTINGS, SettingsStore } from "../../src/settings.js";
import type { Job, JobPatch } from "../../src/shared/types.js";
import { defaultBrandValues } from "../../src/brands/schema.js";

export const TEMPLATE = join(import.meta.dirname, "../../../../brand/_template");

export interface Env { tmp: string; root: string; data: string; reg: BrandRegistry; svc: CreatorServices; daily: string[]; patches: JobPatch[]; ctx: (job: Job) => HandlerCtx }

/** A scratch workspace and data folder, a registry that reads the real brand/_template of the program, a settings store and the creator services. */
export function makeEnv(extra: { claudeBin?: string } = {}): Env {
  const tmp = mkdtempSync(join(tmpdir(), "creator-"));
  const root = join(tmp, "root"), data = join(tmp, "data");
  mkdirSync(join(root, "brand"), { recursive: true }); mkdirSync(data, { recursive: true });
  const reg = new BrandRegistry({ root, dataDir: data, chromeRoot: join(data, "chrome"), programRoot: join(TEMPLATE, "..", "..") });
  const settings = new SettingsStore(join(data, "settings.json"), { brandFile: (s) => reg.paths(s).settingsFile, defaultSlug: () => reg.defaultSlug(), accountOf: (s) => reg.get(s)?.instagram.account ?? "" });
  const daily: string[] = [];
  const svc: CreatorServices = { root, dataDir: data, brands: reg, uploads: new UploadStore(join(data, "tmp-uploads")), settings, ensureDaily: (s) => { daily.push(s); return true; } };
  const patches: JobPatch[] = [];
  const ctx = (job: Job): HandlerCtx => {
    const slug = job.brand ?? "";
    const brand = reg.get(slug);
    return {
      update: (p) => patches.push(p), signal: new AbortController().signal, settings: DEFAULT_SETTINGS, brand: brand ? { slug, brand, paths: reg.paths(slug, brand) } : null,
      root, claudeBin: extra.claudeBin ?? "/nonexistent", dataDir: data, blogDir: join(root, "sources"), startedAtMs: 0, creator: svc,
    };
  };
  return { tmp, root, data, reg, svc, daily, patches, ctx };
}

export const job = (type: Job["type"], brand: string | undefined, params: Record<string, unknown>): Job => ({
  id: "11111111-2222-3333-4444-555555555555", type, ...(brand ? { brand } : {}), title: "t", status: "running", progress: 0, step: "", steps: [], stepIndex: 0, log: [], params,
  createdAt: "", startedAt: "", finishedAt: null, result: {}, error: null,
});

export const formBrand = (name = "Acme Bakery", slug = "acme-bakery") => ({ ...defaultBrandValues(slug, name), website: "acmebakery.example", about: "Bread and pastry.", audience: "Local families", tone: "Warm", instagram: { account: "acme_bakery" } });
