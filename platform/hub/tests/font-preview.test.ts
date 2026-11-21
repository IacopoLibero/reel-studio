import { describe, expect, it } from "vitest";
import { googleFontCss, previewableFont } from "../web/creator/font-preview";

describe("font preview", () => {
  it("builds the Google Fonts stylesheet address of a family", () => {
    expect(googleFontCss("Bebas Neue")).toBe("https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap");
    expect(googleFontCss("Open Sans")).toBe("https://fonts.googleapis.com/css2?family=Open+Sans&display=swap");
  });
  it("escapes what is not a font name character", () => {
    expect(googleFontCss("A&b=c")).toBe("https://fonts.googleapis.com/css2?family=A%26b%3Dc&display=swap");
  });
  it("previews a name only when it is a known font, or when the list could not be checked", () => {
    expect(previewableFont("Oswald", ["Oswald", "Inter"], true)).toBe(true);
    expect(previewableFont("Oswlad", ["Oswald", "Inter"], true)).toBe(false);
    expect(previewableFont("Anything", [], false)).toBe(true);
    expect(previewableFont("   ", [], false)).toBe(false);
  });
});
