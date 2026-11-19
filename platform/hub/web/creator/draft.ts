import { contrastLevel, contrastRatio, isHex, type ContrastLevel } from "../../src/shared/contrast";

/** What the form edits. Lines and colours are plain strings so every keystroke is allowed; `problems` says what is wrong. */
export interface BrandDraft {
  name: string;
  slug: string;
  /** Once the person edits the slug it no longer follows the name. */
  slugTouched: boolean;
  language: string;
  readoutLanguage: string;
  website: string;
  about: string;
  audience: string;
  tone: string;
  colors: { background: string; text: string; accent: string; secondary: string };
  fonts: { headline: string; body: string };
  closing: { A: { label: string; line: string }; B: { label: string; line: string } };
  offerOn: boolean;
  offer: { lastDay: string; regex: string };
  instagramAccount: string;
  blogDir: string;
}

export const LANGUAGES: readonly [string, string][] = [["en", "English"], ["it", "Italian"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["pt", "Portuguese"], ["nl", "Dutch"]];

export const emptyDraft = (): BrandDraft => ({
  name: "", slug: "", slugTouched: false, language: "en", readoutLanguage: "en", website: "", about: "", audience: "", tone: "",
  colors: { background: "#f5f5f0", text: "#1a1a1a", accent: "#2f6fed", secondary: "#7a4dff" },
  fonts: { headline: "Oswald", body: "Inter" },
  closing: { A: { label: "", line: "" }, B: { label: "Follow for tips", line: "Follow me for more tips." } },
  offerOn: false, offer: { lastDay: "", regex: "" }, instagramAccount: "", blogDir: "",
});

/** A slug from a name, free among `taken`: "Café Roma" gives cafe-roma, then cafe-roma-2. Mirrors the hub's uniqueSlug. */
export function slugFor(name: string, taken: readonly string[]): string {
  const base = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "") || "brand";
  const reserved = ["new", "api", "brands", "template", "default", "settings", "admin", "global"];
  const start = reserved.includes(base) ? `${base}-brand` : base;
  if (!taken.includes(start)) return start;
  for (let n = 2; n < 1000; n++) { const s = `${start.slice(0, 36)}-${n}`; if (!taken.includes(s)) return s; }
  return `${start.slice(0, 30)}-${Date.now().toString(36)}`;
}

export const SLUG_OK = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

/** The name changes the slug until the person types one of their own. Name and "Try <name>" lines follow while still empty. */
export function withName(d: BrandDraft, name: string, taken: readonly string[]): BrandDraft {
  const prevTry = d.name ? `Try ${d.name}` : "";
  return {
    ...d, name, slug: d.slugTouched ? d.slug : slugFor(name, taken),
    closing: { ...d.closing, A: {
      label: d.closing.A.label === "" || d.closing.A.label === prevTry ? (name ? `Try ${name}` : "") : d.closing.A.label,
      line: d.closing.A.line === "" || d.closing.A.line === (prevTry ? `${prevTry} today.` : "") ? (name ? `Try ${name} today.` : "") : d.closing.A.line,
    } },
  };
}

export interface ColorNote { level: ContrastLevel; ratio: number; text: string }

/** Contrast of a colour against the text colour (for the background) or against the background (for the others). Null while a hex is incomplete. */
export function contrastNote(a: string, b: string, what: string): ColorNote | null {
  if (!isHex(a) || !isHex(b)) return null;
  const ratio = contrastRatio(a, b);
  const level = contrastLevel(ratio);
  const t = ratio.toFixed(1);
  return { level, ratio, text: level === "good" ? `${what}: contrast ${t}:1, easy to read.` : level === "large-text-only" ? `${what}: contrast ${t}:1, fine for big headlines, weak for small captions.` : `${what}: contrast ${t}:1, hard to read. Pick colours that are further apart.` };
}

export type Problems = Readonly<Record<string, string>>;

export interface DraftContext { taken: readonly string[]; fontNames: readonly string[]; fontsChecked: boolean }

/** Field problems keyed by field name. The hub checks everything again; this keeps the form honest while typing. */
export function validateDraft(d: BrandDraft, c: DraftContext): Problems {
  const p: Record<string, string> = {};
  if (!d.name.trim()) p.name = "The brand needs a name.";
  if (!SLUG_OK.test(d.slug)) p.slug = "Use lowercase letters, digits and dashes, up to 40 characters.";
  else if (c.taken.includes(d.slug)) p.slug = `The slug "${d.slug}" is already used by another brand.`;
  for (const k of ["background", "text", "accent", "secondary"] as const) if (!isHex(d.colors[k])) p[`color-${k}`] = "Use a colour like #d94a3d.";
  for (const k of ["headline", "body"] as const) {
    if (!d.fonts[k].trim()) p[`font-${k}`] = "Name a font.";
    else if (c.fontsChecked && !c.fontNames.includes(d.fonts[k])) p[`font-${k}`] = `"${d.fonts[k]}" is not a Google font that Remotion can load. Pick one from the list.`;
  }
  for (const k of ["A", "B"] as const) {
    if (!d.closing[k].label.trim()) p[`closing-${k}-label`] = "Give the option a short label.";
    if (!d.closing[k].line.trim()) p[`closing-${k}-line`] = "Write the closing line.";
  }
  if (d.offerOn) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.offer.lastDay)) p["offer-lastDay"] = "Choose the last day of the offer.";
    if (d.offer.regex.trim()) { try { new RegExp(d.offer.regex, "i"); } catch { p["offer-regex"] = "That is not a valid pattern."; } }
  }
  if (!/^[A-Za-z0-9._]{0,40}$/.test(d.instagramAccount)) p.instagram = "Letters, digits, dots and underscores only, without the @.";
  if (d.blogDir.trim() && !d.blogDir.trim().startsWith("/")) p.blogDir = "Use a full folder path, such as /home/me/blog.";
  return p;
}

/** The brand object the hub validates (brand.json without slug clashes: the hub has the last word). */
export function draftToBrand(d: BrandDraft): Record<string, unknown> {
  return {
    version: 1, slug: d.slug, name: d.name.trim(), language: d.language, readoutLanguage: d.readoutLanguage,
    website: d.website.trim(), about: d.about.trim(), audience: d.audience.trim(), tone: d.tone.trim(),
    colors: { ...d.colors }, fonts: { headline: d.fonts.headline.trim(), body: d.fonts.body.trim() },
    closing: { A: { label: d.closing.A.label.trim(), line: d.closing.A.line.trim() }, B: { label: d.closing.B.label.trim(), line: d.closing.B.line.trim() } },
    offer: d.offerOn ? { lastDay: d.offer.lastDay, regex: d.offer.regex.trim() || null } : { lastDay: null, regex: null },
    instagram: { account: d.instagramAccount.trim() },
    sources: { blogDir: d.blogDir.trim() || null },
  };
}

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** The other way: a brand from the interview or an import becomes form values (used to show a summary and to edit a slug). */
export function brandToDraft(b: Record<string, unknown>): BrandDraft {
  const e = emptyDraft();
  const c = rec(b.colors), f = rec(b.fonts), cl = rec(b.closing), a = rec(cl.A), bb = rec(cl.B), o = rec(b.offer);
  return {
    ...e, name: str(b.name), slug: str(b.slug), slugTouched: true, language: str(b.language, "en"), readoutLanguage: str(b.readoutLanguage, "en"),
    website: str(b.website), about: str(b.about), audience: str(b.audience), tone: str(b.tone),
    colors: { background: str(c.background, e.colors.background), text: str(c.text, e.colors.text), accent: str(c.accent, e.colors.accent), secondary: str(c.secondary, e.colors.secondary) },
    fonts: { headline: str(f.headline, e.fonts.headline), body: str(f.body, e.fonts.body) },
    closing: { A: { label: str(a.label), line: str(a.line) }, B: { label: str(bb.label, e.closing.B.label), line: str(bb.line, e.closing.B.line) } },
    offerOn: !!o.lastDay || !!o.regex, offer: { lastDay: str(o.lastDay), regex: str(o.regex) },
    instagramAccount: str(rec(b.instagram).account), blogDir: str(rec(b.sources).blogDir),
  };
}
