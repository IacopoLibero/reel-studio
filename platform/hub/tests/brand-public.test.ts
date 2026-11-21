import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { identityJson, pickBrand, removeStage, removeStaleStages, stagePublic, stageRoot, themeFile } from "../../../scripts/brand-public";

let ws: string;
const put = (rel: string, data = "x") => { const f = join(ws, rel); mkdirSync(join(f, ".."), { recursive: true }); writeFileSync(f, data); return f; };
const brand = (slug: string) => put(`brand/${slug}/identity/brand.json`, "{}");
beforeEach(() => { ws = mkdtempSync(join(tmpdir(), "brand-public-")); });
afterEach(() => rmSync(ws, { recursive: true, force: true }));

describe("which brand a render is for", () => {
  it("takes REEL_BRAND when that brand exists, else the first brand by name", () => {
    brand("zeta"); brand("alpha");
    expect(pickBrand(ws, { REEL_BRAND: "zeta" })).toBe("zeta");
    expect(pickBrand(ws, {})).toBe("alpha");
    expect(pickBrand(ws, { REEL_BRAND: "  " })).toBe("alpha");
  });
  it("fails for a REEL_BRAND that names no brand, instead of rendering with another brand's look", () => {
    brand("alpha");
    expect(() => pickBrand(ws, { REEL_BRAND: "ghost" })).toThrow(/REEL_BRAND is "ghost"/);
    expect(() => pickBrand(ws, { REEL_BRAND: "../x" })).toThrow(/REEL_BRAND/);
    expect(() => pickBrand(ws, { REEL_BRAND: "Alpha" })).toThrow(/REEL_BRAND/);
  });
  it("ignores folders without an identity/brand.json and the old flat layout", () => {
    put("brand/old/brand.json"); put("brand/_template/identity/brand.json"); put("brand/.hidden/identity/brand.json");
    expect(pickBrand(ws, {})).toBeNull();
  });
  it("gives the brand's own brand.json as the theme, or a built-in default when there is no brand", () => {
    brand("acme");
    expect(themeFile(ws, "acme")).toBe(identityJson(ws, "acme"));
    const d = themeFile(ws, null);
    expect(JSON.parse(readFileSync(d, "utf8")).colors.accent).toBe("#2f6fed");
  });
});

describe("the public folder of a brand", () => {
  beforeEach(() => {
    brand("acme"); brand("beta");
    put("brand/acme/identity/logo.png", "ACME-LOGO"); put("brand/beta/identity/logo.png", "BETA-LOGO");
    put("brand/acme/mascot/movements/idle/f-0001.png", "frame"); put("brand/acme/mascot/movements/idle/info.json", "{}");
    put("brand/acme/mascot/pip.py", "script"); // not a movement: stays out
    put("sfx/pop.wav", "pop"); put("sfx/tick.wav", "tick");
    put("brand/acme/reels/3-first-one/audio/narrator.wav", "FINAL"); put("brand/acme/reels/3-first-one/audio/narrator-0.wav", "piece"); put("brand/acme/reels/3-first-one/audio/narrator-16k.wav", "16k"); put("brand/acme/reels/3-first-one/audio/gap.wav", "gap");
    put("brand/acme/reels/4-no-audio/caption.md", "c"); put("brand/beta/reels/1-other/audio/narrator.wav", "NARR");
    put("brand/acme/reels/notes/audio/x.wav", "x");
  });
  const read = (dir: string, rel: string) => readFileSync(join(dir, rel), "utf8");

  it("holds the logo, the moves, the sounds and the final audio of each reel of that brand", () => {
    const dir = stagePublic(ws, "acme", "t1");
    expect(dir).toBe(join(stageRoot(ws), "acme-t1"));
    expect(read(dir, "logo.png")).toBe("ACME-LOGO");
    expect(read(dir, "mascot/idle/f-0001.png")).toBe("frame");
    expect(existsSync(join(dir, "mascot/pip.py"))).toBe(false);
    expect(read(dir, "sfx/pop.wav")).toBe("pop");
    expect(read(dir, "3-first-one/narrator.wav")).toBe("FINAL"); // the path the reels' props use: <folder>/<voice>.wav
    expect(existsSync(join(dir, "3-first-one/narrator-0.wav"))).toBe(false); // the pieces are not needed to render
    expect(existsSync(join(dir, "3-first-one/narrator-16k.wav"))).toBe(false);
    expect(existsSync(join(dir, "4-no-audio"))).toBe(false);
    expect(existsSync(join(dir, "notes"))).toBe(false); // not a reel folder
  });
  it("never mixes brands: another brand's logo and audio stay out", () => {
    const dir = stagePublic(ws, "beta", "t2");
    expect(read(dir, "logo.png")).toBe("BETA-LOGO");
    expect(read(dir, "1-other/narrator.wav")).toBe("NARR");
    expect(existsSync(join(dir, "3-first-one"))).toBe(false);
    expect(existsSync(join(dir, "mascot"))).toBe(false); // beta has no character
  });
  it("has no logo.png for a brand without a logo, so a stale one is never drawn", () => {
    rmSync(join(ws, "brand/acme/identity/logo.png"));
    expect(existsSync(join(stagePublic(ws, "acme", "t3"), "logo.png"))).toBe(false);
  });
  it("links the files instead of copying them, and a second run gets a clean folder", () => {
    const dir = stagePublic(ws, "acme", "t4");
    expect(statSync(join(dir, "logo.png")).ino).toBe(statSync(join(ws, "brand/acme/identity/logo.png")).ino);
    put(".reel-studio/public/acme-t4/old.txt", "left over");
    stagePublic(ws, "acme", "t4");
    expect(existsSync(join(dir, "old.txt"))).toBe(false);
  });
  it("makes a folder per run, so renders at the same time do not share one", () => {
    expect(stagePublic(ws, "acme", "a")).not.toBe(stagePublic(ws, "acme", "b"));
  });
  it("keeps the folder of each Unix user apart, so a run as root cannot block the owner's jobs", () => {
    expect(stageRoot(ws)).toBe(join(ws, ".reel-studio", `public-${process.getuid?.()}`));
    expect(stagePublic(ws, "acme", "u1").startsWith(join(ws, ".reel-studio", "public-"))).toBe(true);
  });
  it("works with no brand at all: just the sounds", () => {
    const dir = stagePublic(ws, null, "t5");
    expect(read(dir, "sfx/tick.wav")).toBe("tick");
    expect(existsSync(join(dir, "logo.png"))).toBe(false);
  });
  it("removes its folder, and the folders of runs that were killed long ago", () => {
    const dir = stagePublic(ws, "acme", "t6"); removeStage(dir);
    expect(existsSync(dir)).toBe(false);
    const old = stagePublic(ws, "acme", "111"), fresh = stagePublic(ws, "acme", "222");
    const past = new Date(Date.now() - 13 * 3600_000); utimesSync(old, past, past);
    removeStaleStages(ws, undefined, undefined, () => false);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
  });
  it("keeps an old folder whose process is still running (a studio left open overnight)", () => {
    const open = stagePublic(ws, "acme", "333"), gone = stagePublic(ws, "acme", "444");
    const past = new Date(Date.now() - 30 * 3600_000); utimesSync(open, past, past); utimesSync(gone, past, past);
    removeStaleStages(ws, undefined, undefined, (pid) => pid === 333);
    expect(existsSync(open)).toBe(true);
    expect(existsSync(gone)).toBe(false);
  });
  it("links only the final audio of a reel, also inside sub-folders of audio/", () => {
    put("brand/acme/reels/5-deep/audio/more/narrator.wav", "DEEP"); put("brand/acme/reels/5-deep/audio/more/narrator-1.wav", "piece");
    const dir = stagePublic(ws, "acme", "t7");
    expect(existsSync(join(dir, "5-deep/more/narrator.wav"))).toBe(true);
    expect(existsSync(join(dir, "5-deep/more/narrator-1.wav"))).toBe(false);
  });
});
