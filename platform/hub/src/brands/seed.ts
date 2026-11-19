import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultBrandValues, validateBrand, type Brand, type BrandInput } from "./schema.js";

const read = (f: string): string => { try { return readFileSync(f, "utf8"); } catch { return ""; } };
const title = (slug: string): string => slug.split(/[-_]/).filter(Boolean).map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ") || slug;
const hexAfter = (md: string, label: RegExp): string | null => new RegExp(`${label.source}[^\\n#]*?(#[0-9a-fA-F]{6})`, "i").exec(md)?.[1] ?? null;
const fontAfter = (md: string, label: RegExp): string | null => new RegExp(`${label.source}[^\\n]*?\\*\\*([^*]+)\\*\\*`, "i").exec(md)?.[1]?.trim() ?? null;

export interface SeedInput {
  root: string;
  slug: string;
  env: NodeJS.ProcessEnv;
}

/**
 * The brand.json for a brand that only has a folder (style.md, reel-questions.md) and the .env values of the single-brand releases:
 * IG_USER_ID, IG_ACCOUNT, BLOG_DIR, OFFER_LAST_DAY, OFFER_REGEX. Colours and fonts are read from style.md when it names them.
 * Only used by the migration: after it, brand.json is the source and the .env values are ignored.
 */
export function seedBrand({ root, slug, env }: SeedInput): Brand {
  const dir = join(root, "brand", slug);
  const style = read(join(dir, "style.md"));
  const line = /^Brand:\s*(.+)$/m.exec(style)?.[1] ?? "";
  const name = (line.includes("(") ? line.slice(0, line.indexOf("(")) : line.split(/\.\s/)[0] ?? "").replace(/[.\s]+$/, "").trim() || title(slug);
  const website = (/\(([^)]+)\)/.exec(line)?.[1] ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const base = defaultBrandValues(slug, name) as Required<Pick<BrandInput, "colors" | "fonts" | "closing">> & BrandInput;
  const lastDay = env.OFFER_LAST_DAY?.trim() || null;
  const regex = env.OFFER_REGEX?.trim() || null;
  const script = existsSync(join(root, "mascot")) ? readdirSync(join(root, "mascot")).filter((f) => f.endsWith(".py")).sort()[0] : undefined;
  const voice = existsSync(dir) ? readdirSync(dir).find((f) => f.endsWith("-voice.wav") || f === "voice.wav") : undefined;
  const candidate: BrandInput = {
    ...base,
    website,
    colors: {
      background: hexAfter(style, /Background/) ?? base.colors.background, text: hexAfter(style, /\bText/) ?? base.colors.text,
      accent: hexAfter(style, /\bAccent:/) ?? base.colors.accent, secondary: hexAfter(style, /Secondary accent/) ?? base.colors.secondary,
    },
    fonts: { headline: fontAfter(style, /Headlines/) ?? base.fonts.headline, body: fontAfter(style, /Captions/) ?? base.fonts.body },
    offer: { lastDay: lastDay && /^\d{4}-\d{2}-\d{2}$/.test(lastDay) ? lastDay : null, regex },
    instagram: { account: env.IG_ACCOUNT?.trim() ?? "", userId: (env.IG_USER_ID ?? "").trim().replace(/\D/g, ""), profileDir: null },
    sources: { blogDir: env.HUB_BLOG_DIR?.trim() || env.BLOG_DIR?.trim() || null },
    character: script ? { enabled: true, id: script.slice(0, -3), name: title(script.slice(0, -3)) } : { enabled: false, id: "character", name: "" },
    voice: { engine: "voxcpm2", sample: voice ? `${voice}` : null, sampleText: voice && existsSync(join(dir, voice.replace(/\.wav$/, ".txt"))) ? voice.replace(/\.wav$/, ".txt") : null },
  };
  const v = validateBrand(candidate);
  if (v.ok) return v.brand;
  // A value found in style.md or .env that does not validate (a bad regex, an odd account name): fall back to the plain defaults.
  const plain = validateBrand(defaultBrandValues(slug, name));
  if (!plain.ok) throw new Error(`Cannot seed brand "${slug}": ${plain.errors.join("; ")}`);
  return plain.brand;
}
