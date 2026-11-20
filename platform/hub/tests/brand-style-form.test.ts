import { describe, expect, it } from "vitest";
import { styleProblems } from "../web/components/BrandStyle";
import type { BrandStyle } from "../web/api";

const ok: BrandStyle = {
  colors: { background: "#101010", text: "#fafafa", accent: "#ff8800", secondary: "#00aaff" },
  fonts: { headline: "Oswald", body: "Inter" },
  closing: { A: { label: "Offer", line: "x" }, B: { label: "Tips", line: "y" } },
};

describe("styleProblems", () => {
  it("accepts a valid style", () => expect(styleProblems(ok)).toEqual({}));
  it("names the colour that is not a hex value", () => {
    expect(Object.keys(styleProblems({ ...ok, colors: { ...ok.colors, accent: "orange", text: "#12" } }))).toEqual(["color-text", "color-accent"]);
  });
  it("names an empty font", () => {
    expect(Object.keys(styleProblems({ ...ok, fonts: { headline: " ", body: "Inter" } }))).toEqual(["font-headline"]);
  });
});
