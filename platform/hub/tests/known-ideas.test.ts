import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isDuplicate } from "../src/ideas/dedupe.js";
import { knownIdeas } from "../src/ideas/known.js";

function brand(): string {
  const d = mkdtempSync(join(tmpdir(), "known-"));
  writeFileSync(join(d, "reel-questions.md"), "## To do\n- [ ] Why do guests hate QR menus?\n");
  mkdirSync(join(d, "reels", "3-menu-photos-sell"), { recursive: true });
  writeFileSync(join(d, "reels", "3-menu-photos-sell", "script.json"), JSON.stringify({ sentences: [{ text: "Do photos sell more dishes?" }] }));
  mkdirSync(join(d, "carousels", "0-changed-price-2d"), { recursive: true });
  writeFileSync(join(d, "carousels", "0-changed-price-2d", "carousel.json"), JSON.stringify({ topic: "Changed a price? Stop reprinting.", title: "t" }));
  mkdirSync(join(d, "analytics"));
  writeFileSync(join(d, "analytics", "hooks.csv"), "hook,plays\nIs a shorter menu faster?,42\n");
  return d;
}

describe("knownIdeas", () => {
  it("gathers the list, the reels, the carousels and the posted hooks", () => {
    const known = knownIdeas(brand());
    expect(isDuplicate("Do photos sell more dishes?", known)).toBe(true);
    expect(isDuplicate("Changed a price? Stop reprinting", known)).toBe(true);
    expect(isDuplicate("Is a shorter menu faster?", known)).toBe(true);
    expect(isDuplicate("Why do guests hate QR menus", known)).toBe(true);
    expect(isDuplicate("What should a staff handbook cover?", known)).toBe(false);
  });
  it("is empty for a brand with nothing yet", () => { expect(knownIdeas(mkdtempSync(join(tmpdir(), "known-")))).toEqual([]); });
});
