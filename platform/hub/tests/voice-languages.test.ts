import { describe, expect, it } from "vitest";
import { VOICE_LANGUAGES, isVoiceLanguage, withLanguageLine } from "../src/brands/languages.js";
import { languageName } from "../src/brands/wording.js";

describe("voice languages", () => {
  it("lists the 30 languages of the VoxCPM2 voice, each with a two-letter code and a name, without repeats", () => {
    expect(VOICE_LANGUAGES).toHaveLength(30);
    expect(new Set(VOICE_LANGUAGES.map((l) => l.code)).size).toBe(30);
    for (const l of VOICE_LANGUAGES) { expect(l.code).toMatch(/^[a-z]{2}$/); expect(l.name.length).toBeGreaterThan(2); }
    expect(VOICE_LANGUAGES.map((l) => l.code)).toEqual(expect.arrayContaining(["en", "it", "es", "fr", "de", "pt", "zh", "ja"]));
  });
  it("is sorted by name, so the select reads in order", () => {
    const names = VOICE_LANGUAGES.map((l) => l.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
  it("knows a language by its code, ignoring a region (pt-BR is Portuguese)", () => {
    expect(isVoiceLanguage("it")).toBe(true);
    expect(isVoiceLanguage("pt-BR")).toBe(true);
    expect(isVoiceLanguage("xx")).toBe(false);
    expect(isVoiceLanguage("")).toBe(false);
  });
  it("languageName covers every one of them", () => {
    for (const l of VOICE_LANGUAGES) expect(languageName(l.code)).toBe(l.name);
    expect(languageName("xx")).toBe("xx");
  });
});

describe("withLanguageLine", () => {
  it("rewrites the sentence of style.md that names the language of the reels", () => {
    const md = "# Style\n\n## About the brand\n- What it is: bread\n- The reels are written and spoken in English.\n- Tone: warm\n";
    expect(withLanguageLine(md, "it")).toContain("- The reels are written and spoken in Italian.\n- Tone: warm");
    expect(withLanguageLine(md, "it")).not.toContain("English");
  });
  it("leaves a style.md without that sentence as it is", () => {
    const md = "# Style\n\nsome text\n";
    expect(withLanguageLine(md, "it")).toBe(md);
  });
});
