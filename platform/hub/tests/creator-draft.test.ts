import { describe, expect, it } from "vitest";
import { brandToDraft, closingRulesOf, parseKeywords, sharedKeywords, contrastNote, draftToBrand, emptyDraft, slugFor, validateDraft, withName, wordCount, type BrandDraft } from "../web/creator/draft";
import { validateBrand } from "../src/brands/schema";

const ctx = { taken: ["acme"], fontNames: ["Oswald", "Inter"], fontsChecked: true };
const filled = (over: Partial<BrandDraft> = {}): BrandDraft => ({ ...withName(emptyDraft(), "Acme Bakery", ctx.taken), ...over });

describe("slugs and names in the form", () => {
  it("makes a readable slug and a free one", () => {
    expect(slugFor("Café Roma!", [])).toBe("cafe-roma");
    expect(slugFor("Acme", ["acme"])).toBe("acme-2");
    expect(slugFor("New", [])).toBe("new-brand");
    expect(slugFor("!!!", [])).toBe("brand");
  });
  it("follows the name until the slug is edited, and fills the closing A line", () => {
    const a = withName(emptyDraft(), "Acme Bakery", []);
    expect(a).toMatchObject({ slug: "acme-bakery", closing: { A: { label: "Try Acme Bakery", line: "Try Acme Bakery today." } } });
    expect(withName(a, "Acme Bread", []).closing.A.label).toBe("Try Acme Bread");
    const mine = withName({ ...a, slug: "mine", slugTouched: true, closing: { ...a.closing, A: { label: "Order now", line: "Order at acme." } } }, "Acme Bread", []);
    expect(mine.slug).toBe("mine");
    expect(mine.closing.A).toEqual({ label: "Order now", line: "Order at acme." });
  });
  it("counts words", () => { expect(wordCount(" a  b c ")).toBe(3); expect(wordCount("")).toBe(0); });
});

describe("colour contrast notes", () => {
  it("tells good, large-text-only and poor apart, and stays quiet on half-typed colours", () => {
    expect(contrastNote("#f5f0e8", "#1a1a1a", "Text")?.level).toBe("good");
    expect(contrastNote("#ffffff", "#8a8a8a", "Text")?.level).toBe("large-text-only");
    expect(contrastNote("#777777", "#808080", "Text")?.text).toContain("hard to read");
    expect(contrastNote("#f5f0", "#1a1a1a", "Text")).toBeNull();
  });
});

describe("validating the form", () => {
  it("accepts a filled form and produces a brand the hub schema accepts", () => {
    const d = filled();
    expect(validateDraft(d, ctx)).toEqual({});
    expect(validateBrand(draftToBrand(d)).ok).toBe(true);
  });
  it("lists every problem by field", () => {
    const d = filled({ name: "", slug: "acme", colors: { background: "red", text: "#000000", accent: "#12", secondary: "#222222" }, fonts: { headline: "Nope Sans", body: "" }, offerOn: true, offer: { lastDay: "", regex: "(" }, instagramAccount: "@x", blogDir: "rel/dir" });
    const p = validateDraft(d, ctx);
    for (const k of ["name", "slug", "color-background", "color-accent", "font-headline", "font-body", "offer-lastDay", "offer-regex", "instagram", "blogDir"]) expect(p[k], k).toBeTruthy();
    expect(p["font-headline"]).toContain("Nope Sans");
    expect(validateDraft(filled({ closing: { A: { label: "", line: "" }, B: { label: "x", line: "y" } } }), ctx)["closing-A-label"]).toBeTruthy();
    expect(validateDraft(filled({ slug: "Bad Slug" }), ctx).slug).toContain("lowercase");
  });
  it("does not judge font names when the hub cannot check them", () => {
    expect(validateDraft(filled({ fonts: { headline: "Whatever", body: "Else" } }), { ...ctx, fontsChecked: false })).toEqual({});
  });
  it("leaves the offer out when it is off", () => {
    expect(draftToBrand(filled({ offerOn: false, offer: { lastDay: "2026-12-01", regex: "x" } })).offer).toEqual({ lastDay: null, regex: null });
    expect(draftToBrand(filled({ offerOn: true, offer: { lastDay: "2026-12-01", regex: "" } })).offer).toEqual({ lastDay: "2026-12-01", regex: null });
  });
});

describe("brand to form values", () => {
  it("round-trips what the form makes", () => {
    const d = filled({ about: "Bread.", audience: "Families", tone: "Warm", instagramAccount: "acme_bakery", offerOn: true, offer: { lastDay: "2026-12-01", regex: "CODE" } });
    const back = brandToDraft(draftToBrand(d));
    expect(draftToBrand(back)).toEqual(draftToBrand(d));
    expect(brandToDraft({}).colors.accent).toBe("#2f6fed");
  });
});

describe("closing keywords in the form", () => {
  it("splits lines and commas, trims and drops repeats", () => {
    expect(parseKeywords(" menu\nQR code, menu ,,translat*\n")).toEqual(["menu", "QR code", "translat*"]);
    expect(parseKeywords("")).toEqual([]);
  });
  it("keeps a word in both boxes only on the product side", () => {
    const k = { product: "menu\nqr", general: "Menu\ntax" };
    expect(sharedKeywords(k)).toEqual(["menu"]);
    expect(closingRulesOf(k)).toEqual({ product: ["menu", "qr"], general: ["tax"] });
  });
  it("starts empty and is not part of brand.json", () => {
    expect(emptyDraft().closingKeywords).toEqual({ product: "", general: "" });
    expect(draftToBrand(filled())).not.toHaveProperty("closingKeywords");
  });
});
