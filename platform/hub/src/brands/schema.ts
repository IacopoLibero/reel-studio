import { z } from "zod";

/** Folder names a brand may use. "_template" and names that clash with routes are reserved. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const RESERVED_SLUGS: readonly string[] = ["new", "api", "brands", "template", "default", "settings", "admin", "global"];

export const isValidSlug = (s: string): boolean => SLUG_RE.test(s) && !RESERVED_SLUGS.includes(s);

/** A readable slug from a brand name: "Café Roma!" gives "cafe-roma". Falls back to "brand". */
export function slugify(name: string): string {
  const s = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  return isValidSlug(s) ? s : s && !RESERVED_SLUGS.includes(s) ? "brand" : s ? `${s}-brand` : "brand";
}

/** The first free slug for a name: "cafe", then "cafe-2", "cafe-3" ... `taken` lists the slugs in use. */
export function uniqueSlug(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slugify(name);
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const next = `${base.slice(0, 36)}-${n}`;
    if (!used.has(next)) return next;
  }
  return `${base.slice(0, 30)}-${Date.now().toString(36)}`;
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colours look like #d94a3d");
const text = (max: number) => z.string().trim().max(max);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const closingOption = z.object({ label: text(80), line: text(400) });

const regexText = z.string().trim().max(200).refine((v) => {
  try { new RegExp(v, "i"); return true; } catch { return false; }
}, "That is not a valid regular expression");

export const styleSchema = z.object({
  colors: z.object({ background: hex, text: hex, accent: hex, secondary: hex }),
  fonts: z.object({ headline: text(80).min(1, "A font name is needed"), body: text(80).min(1, "A font name is needed") }),
  closing: z.object({ A: closingOption, B: closingOption }),
});
export type BrandStyle = z.infer<typeof styleSchema>;

export const brandSchema = z.object({
  version: z.literal(1),
  slug: z.string().refine(isValidSlug, "Slug: lowercase letters, digits and dashes, up to 40 characters"),
  name: text(80).min(1, "The brand needs a name"),
  language: z.string().regex(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/, "Use a language code like en or it").default("en"),
  /** The language the hub writes in for the person who runs the brand (readouts, analysis). The reels use `language`. */
  readoutLanguage: z.string().regex(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/, "Use a language code like en or it").default("en"),
  website: text(200).default(""),
  about: text(2000).default(""),
  audience: text(1000).default(""),
  tone: text(1000).default(""),
  colors: z.object({ background: hex, text: hex, accent: hex, secondary: hex }),
  fonts: z.object({ headline: text(80).min(1), body: text(80).min(1) }),
  closing: z.object({ A: closingOption, B: closingOption }),
  offer: z.object({ lastDay: day.nullable(), regex: regexText.nullable() }).default({ lastDay: null, regex: null }),
  instagram: z.object({
    account: z.string().regex(/^[A-Za-z0-9._]{0,40}$/, "Account name has invalid characters").default(""),
    userId: z.string().regex(/^\d{0,30}$/, "The Instagram user id is only digits").default(""),
    /** Absolute folder of the browser profile. Empty = <chrome profile root>/<slug>. Set for a profile that already existed. */
    /** Ignored: the Instagram login is always in the brand's own folder (`profile/`). Kept so a brand.json that still has the field stays valid. */
  profileDir: z.string().max(300).nullable().default(null),
  }).default({ account: "", userId: "", profileDir: null }),
  sources: z.object({ blogDir: z.string().max(400).nullable() }).default({ blogDir: null }),
  character: z.object({
    enabled: z.boolean(),
    id: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/).default("character"),
    name: text(80).default(""),
  }).default({ enabled: false, id: "character", name: "" }),
  voice: z.object({
    engine: text(40).default("voxcpm2"),
    sample: text(300).nullable().default(null),
    sampleText: text(300).nullable().default(null),
  }).default({ engine: "voxcpm2", sample: null, sampleText: null }),
});

export type Brand = z.infer<typeof brandSchema>;
export type BrandInput = z.input<typeof brandSchema>;

export type Validation = { ok: true; brand: Brand } | { ok: false; errors: string[] };

/** Validates an unknown value (a form, an imported file) as a brand. Errors are readable lines such as "colors.accent: Colours look like ...". */
export function validateBrand(input: unknown): Validation {
  const r = brandSchema.safeParse(input);
  if (r.success) return { ok: true, brand: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join(".") || "brand"}: ${i.message}`) };
}

/** Neutral values for a new brand: the creator and the migration fill in what they know and keep the rest. */
export function defaultBrandValues(slug: string, name: string): BrandInput {
  return {
    version: 1, slug, name,
    colors: { background: "#f5f5f0", text: "#1a1a1a", accent: "#2f6fed", secondary: "#7a4dff" },
    fonts: { headline: "Oswald", body: "Inter" },
    closing: {
      A: { label: `Try ${name}`, line: `Try ${name} today.` },
      B: { label: "Follow for tips", line: "Follow me for more tips." },
    },
  };
}
