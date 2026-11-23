import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { brandLanguage, numberWords } from "../../../scripts/voice-language.mjs";

let tmp: string, reel: string;
const brandJson = (language: unknown) => { mkdirSync(join(tmp, "identity"), { recursive: true }); writeFileSync(join(tmp, "identity", "brand.json"), JSON.stringify({ name: "Acme", language })); };
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "voice-lang-")); reel = join(tmp, "reels", "3-half-loaf"); mkdirSync(reel, { recursive: true }); });
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("brandLanguage", () => {
  it("reads the language of the brand the reel folder belongs to", () => {
    brandJson("it");
    expect(brandLanguage(reel, {})).toBe("it");
  });
  it("takes the base language of a code with a region", () => {
    brandJson("pt-BR");
    expect(brandLanguage(reel, {})).toBe("pt");
  });
  it("works with a relative reel folder and a trailing slash", () => {
    brandJson("de");
    expect(brandLanguage(`${reel}/`, {})).toBe("de");
  });
  it("is English when the brand has none, or the file is missing, damaged or odd", () => {
    expect(brandLanguage(reel, {})).toBe("en");
    mkdirSync(join(tmp, "identity"), { recursive: true });
    writeFileSync(join(tmp, "identity", "brand.json"), "{broken");
    expect(brandLanguage(reel, {})).toBe("en");
    for (const odd of [null, 5, "", "x", "123"]) { brandJson(odd); expect(brandLanguage(reel, {}), String(odd)).toBe("en"); }
  });
  it("REEL_LANGUAGE wins over the brand", () => {
    brandJson("it");
    expect(brandLanguage(reel, { REEL_LANGUAGE: "FR" })).toBe("fr");
    expect(brandLanguage(reel, { REEL_LANGUAGE: "  " })).toBe("it");
  });
});

describe("numberWords", () => {
  it("has the English digit words only for English", () => {
    expect(numberWords("en")[3]).toBe("three");
    expect(numberWords("it")).toEqual({});
  });
});

import { mergeTokens } from "../../../scripts/voice-language.mjs";

describe("mergeTokens", () => {
  const t = (text: string, startMs: number, endMs: number) => ({ text, startMs, endMs });
  it("puts the pieces of a word back together, from its first piece to the end of its last", () => {
    expect(mergeTokens([t("Il", 0, 100), t(" r", 120, 200), t("aff", 200, 300), t("ermo", 300, 450), t(" va", 480, 600)])).toEqual([t("Il", 0, 100), t("raffermo", 120, 450), t("va", 480, 600)]);
  });
  it("joins a full stop to the word before it and drops what has no letter or digit on its own", () => {
    expect(mergeTokens([t(" minut", 0, 90), t("i", 90, 150), t(".", 150, 160), t(" Poi", 200, 300), t(" ...", 300, 310)])).toEqual([t("minuti.", 0, 160), t("Poi", 200, 310)].map((w, i) => (i === 1 ? { ...w, text: "Poi..." } : w)));
  });
  it("keeps English words as they were and joins a contraction", () => {
    expect(mergeTokens([t(" Do", 0, 50), t("n", 50, 60), t("'t", 60, 90), t(" stop", 100, 200)])).toEqual([t("Don't", 0, 90), t("stop", 100, 200)]);
  });
  it("is empty for nothing, and ignores blank pieces", () => {
    expect(mergeTokens([])).toEqual([]);
    expect(mergeTokens([t("  ", 0, 10), t("", 10, 20)])).toEqual([]);
  });
});
