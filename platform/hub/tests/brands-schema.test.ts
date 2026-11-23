import { describe, expect, it } from "vitest";
import { defaultBrandValues, isValidSlug, RESERVED_SLUGS, slugify, uniqueSlug, validateBrand, brandSchema } from "../src/brands/schema.js";
import { templateValues, fillTemplate } from "../src/brands/template.js";
import { audienceOf, aboutLine, languageName } from "../src/brands/wording.js";
import { testBrand } from "./helpers/brand.js";

describe("slug rules", () => {
  it("a brand.json that still has the old instagram.profileDir stays valid, and the field is not kept", () => {
    const v = validateBrand({ ...defaultBrandValues("acme", "Acme"), instagram: { account: "a", userId: "1", profileDir: "/data/chrome-profile" } });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.brand.instagram).toEqual({ account: "a", userId: "1" });
  });
  it("accepts lowercase letters, digits and dashes", () => {
    for (const ok of ["acme", "my-brand", "a1", "0day", "x".repeat(40)]) expect(isValidSlug(ok)).toBe(true);
  });
  it("refuses anything that is unsafe in a path or a URL, and the reserved names", () => {
    for (const bad of ["", "-a", "_template", "Acme", "a b", "a/b", "../x", "a.b", "é", "x".repeat(41), ...RESERVED_SLUGS]) expect(isValidSlug(bad)).toBe(false);
  });
  it("slugify makes a readable slug from a name", () => {
    expect(slugify("Café Roma!")).toBe("cafe-roma");
    expect(slugify("  Acme   Bakery ")).toBe("acme-bakery");
    expect(slugify("日本語")).toBe("brand");
    expect(slugify("New")).toBe("new-brand");
    expect(isValidSlug(slugify("x".repeat(100)))).toBe(true);
  });
  it("uniqueSlug adds a counter when the slug is taken", () => {
    expect(uniqueSlug("Acme", [])).toBe("acme");
    expect(uniqueSlug("Acme", ["acme"])).toBe("acme-2");
    expect(uniqueSlug("Acme", ["acme", "acme-2", "acme-3"])).toBe("acme-4");
  });
});

describe("brand.json schema", () => {
  const base = () => defaultBrandValues("acme", "Acme");
  it("accepts the neutral defaults and fills the optional parts", () => {
    const v = validateBrand(base());
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.brand).toMatchObject({ language: "en", readoutLanguage: "en", offer: { lastDay: null, regex: null }, instagram: { account: "", userId: "" }, character: { enabled: false }, sources: { blogDir: null } });
  });
  it("reports readable errors with the field path", () => {
    const v = validateBrand({ ...base(), colors: { background: "red", text: "#000000", accent: "#fff", secondary: "#123456" }, slug: "Bad Slug" });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.errors.join("\n")).toMatch(/colors\.background: Colours look like/);
    expect(v.errors.join("\n")).toMatch(/colors\.accent/);
    expect(v.errors.join("\n")).toMatch(/slug: Slug: lowercase/);
  });
  it("checks the offer date, the offer pattern, the Instagram account and the user id", () => {
    const bad = (over: object) => validateBrand({ ...base(), ...over }).ok;
    expect(bad({ offer: { lastDay: "30/11", regex: null } })).toBe(false);
    expect(bad({ offer: { lastDay: "2026-11-30", regex: "(" } })).toBe(false);
    expect(bad({ offer: { lastDay: "2026-11-30", regex: "CODE" } })).toBe(true);
    expect(bad({ instagram: { account: "has space", userId: "" } })).toBe(false);
    expect(bad({ instagram: { account: "ok.name_1", userId: "12ab" } })).toBe(false);
    expect(bad({ instagram: { account: "ok.name_1", userId: "123456" } })).toBe(true);
  });
  it("requires the version, a name and both fonts", () => {
    expect(validateBrand({ ...base(), version: 2 }).ok).toBe(false);
    expect(validateBrand({ ...base(), name: "  " }).ok).toBe(false);
    expect(validateBrand({ ...base(), fonts: { headline: "", body: "Inter" } }).ok).toBe(false);
    expect(validateBrand(null).ok).toBe(false);
  });
  it("round-trips through the schema", () => {
    const b = testBrand("acme", { website: "acme.example", offer: { lastDay: "2026-11-30", regex: "ACMEFREE" } });
    expect(brandSchema.parse(JSON.parse(JSON.stringify(b)))).toEqual(b);
  });
});

describe("template values and wording", () => {
  it("fills the known tokens and leaves the rest", () => {
    const b = testBrand("acme", { name: "Acme Cafe", website: "acme.example" });
    expect(templateValues(b)).toMatchObject({ BRAND: "acme", BRAND_NAME: "Acme Cafe", ACCENT_HEX: "#2f6fed", VOICE_NAME: "the narrator" });
    expect(fillTemplate("{{BRAND_NAME}} at {{WEBSITE}} {{MASCOT_DESCRIPTION}}", b)).toBe("Acme Cafe at acme.example {{MASCOT_DESCRIPTION}}");
    expect(templateValues(testBrand("c", { character: { enabled: true, id: "pip", name: "Pip" } })).VOICE_NAME).toBe("Pip");
    expect(templateValues(testBrand("w", { website: "" })).WEBSITE).toBe("your website");
  });
  it("names the audience and the language, with neutral fallbacks", () => {
    expect(audienceOf(undefined)).toBe("the brand's audience");
    expect(audienceOf(testBrand("a", { audience: "cafe owners" }))).toBe("cafe owners");
    expect(aboutLine(undefined)).toBe("");
    expect(aboutLine(testBrand("a", { about: "We sell coffee." }))).toContain("We sell coffee.");
    expect(languageName("it")).toBe("Italian");
    expect(languageName("pt-BR")).toBe("Portuguese");
    expect(languageName("xx")).toBe("xx");
  });
});
