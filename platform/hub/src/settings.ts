import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { DEFAULT_PATTERN } from "./slots.js";
import { DEFAULT_RULES } from "./factory/classifier.js";
import type { Settings } from "./shared/types.js";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Times must look like 07:30");

const keywords = z.array(z.string().trim().min(1).max(60)).max(200);

const dailySchema = z.object({ enabled: z.boolean(), earliest: time, ideas: z.number().int().min(1).max(10), threads: z.boolean().default(false) });

/** What belongs to one brand: its posting pattern, daily loop and factory rules. Stored in data/brands/<slug>/settings.json. */
export const brandSettingsSchema = z.object({
  factory: z.object({
    concurrency: z.number().int().min(1).max(6),
    closingRules: z.object({ product: keywords, general: keywords }),
  }),
  daily: dailySchema.default({ enabled: false, earliest: "06:00", ideas: 3, threads: false }),
  slotPattern: z.object({
    timezone: z.string().refine((tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } }, "Unknown time zone"),
    days: z.array(z.array(time).max(12)).length(7),
  }),
});

export const TERMINAL_PERMISSIONS = ["ask", "edit", "plan", "full"] as const;

/** What is shared by every brand: how Blender renders and which Claude model the jobs use. Stored in data/settings.json. */
export const globalSettingsSchema = z.object({
  blenderDevice: z.enum(["cpu", "gpu", "auto"]),
  claudeModel: z.string().max(80).regex(/^[A-Za-z0-9._:[\]-]*$/, "Model name has invalid characters"),
  // An older settings file may hold {kind: "custom", command}: that setting is gone, the assistant is Claude again.
  /** How much the Terminal page may do without asking: ask each time, edit files, only plan, or everything. */
  terminalPermission: z.enum(TERMINAL_PERMISSIONS).default("ask"),
  assistant: z.preprocess((v) => (v && typeof v === "object" && ["claude", "codex"].includes((v as { kind?: unknown }).kind as string) ? v : { kind: "claude" }), z.object({ kind: z.enum(["claude", "codex"]) })).default({ kind: "claude" }),
});

/** The merged view the Settings page edits and the jobs receive. accountName comes from the brand (brand.json), not from the settings files. */
export const settingsSchema = brandSettingsSchema.extend(globalSettingsSchema.shape).extend({
  accountName: z.string().max(80).regex(/^[A-Za-z0-9._]*$/, "Account name has invalid characters"),
});

export type BrandSettings = z.infer<typeof brandSettingsSchema>;
export type GlobalSettings = z.infer<typeof globalSettingsSchema>;

export const DEFAULT_BRAND_SETTINGS: BrandSettings = {
  factory: { concurrency: 2, closingRules: DEFAULT_RULES }, daily: { enabled: false, earliest: "06:00", ideas: 3, threads: false }, slotPattern: DEFAULT_PATTERN,
};
export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = { blenderDevice: "auto", claudeModel: "", terminalPermission: "ask", assistant: { kind: "claude" } };
export const DEFAULT_SETTINGS: Settings = { ...DEFAULT_BRAND_SETTINGS, ...DEFAULT_GLOBAL_SETTINGS, accountName: "" };

/** Splits the merged settings into the part a brand owns and the shared part. */
export function splitSettings(s: Settings): { brand: BrandSettings; global: GlobalSettings } {
  return {
    brand: { factory: s.factory, daily: s.daily, slotPattern: s.slotPattern },
    global: { blenderDevice: s.blenderDevice, claudeModel: s.claudeModel, terminalPermission: s.terminalPermission, assistant: s.assistant },
  };
}

export const mergeSettings = (brand: BrandSettings, global: GlobalSettings, accountName = ""): Settings => ({ ...brand, ...global, accountName });

function readJson(file: string): Record<string, unknown> | null {
  if (!existsSync(file)) return null;
  try {
    const v: unknown = JSON.parse(readFileSync(file, "utf8"));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch { return null; }
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, file);
}

export interface SettingsStoreOptions {
  /** Settings file of a brand: <data>/brands/<slug>/settings.json. */
  brandFile: (slug: string) => string;
  /** The brand used when a call names none. */
  defaultSlug?: () => string | null;
  /** The Instagram account of a brand (brand.json), shown as accountName. */
  accountOf?: (slug: string) => string;
}

/**
 * Global settings plus one settings file per brand. `get(slug)` returns the merged view; a brand without its own file
 * starts from the legacy keys that an old settings.json still carries (factory, daily, slotPattern), then from the defaults.
 */
export class SettingsStore {
  private global: GlobalSettings;
  private readonly brands = new Map<string, BrandSettings>();

  constructor(private readonly globalFile: string, private readonly o: SettingsStoreOptions) {
    this.global = this.readGlobal();
  }

  private readGlobal(): GlobalSettings {
    const p = globalSettingsSchema.safeParse({ ...DEFAULT_GLOBAL_SETTINGS, ...readJson(this.globalFile) });
    return p.success ? p.data : DEFAULT_GLOBAL_SETTINGS;
  }

  private readBrand(slug: string): BrandSettings {
    const own = readJson(this.o.brandFile(slug));
    const legacy = own ? {} : readJson(this.globalFile) ?? {};
    const p = brandSettingsSchema.safeParse({ ...DEFAULT_BRAND_SETTINGS, ...legacy, ...own });
    return p.success ? p.data : DEFAULT_BRAND_SETTINGS;
  }

  private slug(slug?: string): string {
    const s = slug ?? this.o.defaultSlug?.() ?? null;
    if (!s) throw new Error("No brand to read settings for.");
    return s;
  }

  getGlobal(): GlobalSettings { return this.global; }

  getBrand(slug?: string): BrandSettings {
    const s = this.slug(slug);
    const hit = this.brands.get(s);
    if (hit) return hit;
    const v = this.readBrand(s);
    this.brands.set(s, v);
    return v;
  }

  /** Merged settings of a brand. Without a brand (a machine with none yet) the defaults. */
  get(slug?: string): Settings {
    const s = slug ?? this.o.defaultSlug?.() ?? null;
    if (!s) return { ...DEFAULT_SETTINGS, ...this.global };
    return mergeSettings(this.getBrand(s), this.global, this.o.accountOf?.(s) ?? "");
  }

  /** Saves the merged settings: the brand part to the brand's file, the shared part to the global file. */
  set(next: Settings, slug?: string): Settings {
    const s = this.slug(slug);
    const { brand, global } = splitSettings(next);
    writeJson(this.o.brandFile(s), brand);
    this.brands.set(s, brand);
    this.global = global;
    writeJson(this.globalFile, global);
    return this.get(s);
  }

  /** A view bound to one brand, for code that only needs `get()` (the daily loop, the jobs). */
  forBrand(slug: string): { get: () => Settings } { return { get: () => this.get(slug) }; }
}
