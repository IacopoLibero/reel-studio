import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BrandError, BrandRegistry, listBrandSlugs, readBrand, readBrandFile, writeBrand } from "../src/brands/registry.js";
import { brandPaths, chromeProfileRoot } from "../src/brands/paths.js";
import { brandCtx, blogDirOf } from "../src/brands/context.js";
import { defaultBrandValues } from "../src/brands/schema.js";
import { offerOf, humanDay, isOfferLine, afterOffer, NO_OFFER } from "../src/brands/offer.js";
import { testBrand, writeTestBrand } from "./helpers/brand.js";

let tmp: string, root: string, data: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "brands-")); root = join(tmp, "root"); data = join(tmp, "data"); mkdirSync(root); mkdirSync(data); });
afterEach(() => rmSync(tmp, { recursive: true, force: true }));
// The program folder (where brand/_template lives) is `root` in these tests.
const reg = () => new BrandRegistry({ root, dataDir: data, programRoot: root });

describe("listing and loading", () => {
  it("lists the brands that have a valid identity/brand.json, sorted, never the template or hidden folders", () => {
    writeTestBrand(root, "zeta"); writeTestBrand(root, "alpha");
    mkdirSync(join(root, "brand/_template"), { recursive: true }); writeFileSync(join(root, "brand/_template/brand.json"), "{}");
    mkdirSync(join(data, "brands/.hidden"), { recursive: true });
    mkdirSync(join(data, "brands/nojson"), { recursive: true });
    // A brand.json at the top of the brand folder is the layout of the first releases: not a brand any more.
    mkdirSync(join(data, "brands/old"), { recursive: true }); writeFileSync(join(data, "brands/old/brand.json"), JSON.stringify(testBrand("old")));
    expect(listBrandSlugs(data)).toEqual(["alpha", "zeta"]);
    expect(reg().list().map((b) => b.slug)).toEqual(["alpha", "zeta"]);
    expect(reg().defaultSlug()).toBe("alpha");
    expect(reg().has("zeta")).toBe(true);
    expect(reg().has("nojson")).toBe(false);
  });
  it("has no default on a machine without brands", () => {
    expect(listBrandSlugs(join(tmp, "missing"))).toEqual([]);
    expect(reg().defaultSlug()).toBeNull();
  });
  it("explains why a brand.json cannot be used", () => {
    expect(readBrandFile(data, "nope")).toEqual({ ok: false, errors: ["brand.json: not found"] });
    mkdirSync(join(data, "brands/broken/identity"), { recursive: true });
    writeFileSync(join(data, "brands/broken/identity/brand.json"), "{ not json");
    expect(readBrandFile(data, "broken")).toEqual({ ok: false, errors: ["brand.json: is not valid JSON"] });
    writeFileSync(join(data, "brands/broken/identity/brand.json"), JSON.stringify(testBrand("other")));
    expect((readBrandFile(data, "broken") as { errors: string[] }).errors[0]).toMatch(/folder is "broken"/);
    expect((readBrandFile(data, "../x") as { errors: string[] }).errors[0]).toMatch(/not a valid brand slug/);
    expect(readBrand(data, "broken")).toBeNull();
  });
  it("writes brand.json atomically and refuses an invalid brand", () => {
    const b = testBrand("acme");
    writeBrand(data, { ...b, name: "Acme 2" });
    expect(readBrand(data, "acme")?.name).toBe("Acme 2");
    expect(existsSync(join(data, "brands/acme/identity/brand.json.tmp"))).toBe(false);
    expect(() => writeBrand(data, { ...b, colors: { ...b.colors, accent: "nope" } })).toThrow();
  });
});

describe("paths", () => {
  it("puts everything of a brand under its own folders", () => {
    const p = brandPaths("acme", { dataDir: "/d" });
    const b = "/d/brands/acme"; // everything of a brand is in this one folder
    expect(p).toMatchObject({
      brandDir: b, dataDir: b, identityDir: `${b}/identity`, brandJson: `${b}/identity/brand.json`, styleMd: `${b}/identity/style.md`, logo: `${b}/identity/logo.png`,
      mascotDir: `${b}/mascot`, movementsDir: `${b}/mascot/movements`, reelsDir: `${b}/reels`,
      questionsMd: `${b}/reel-questions.md`, scheduledFile: `${b}/scheduled.json`, settingsFile: `${b}/settings.json`,
      dailyDir: `${b}/daily`, analyticsDir: `${b}/analytics`, ideasDir: `${b}/ideas`,
      seriesFile: `${b}/series.json`, locksDir: `${b}/locks`, notificationsFile: `${b}/notifications.json`,
      profileDir: `${b}/profile`,
    });
  });
  it("two brands never share a path", () => {
    const a = Object.values(brandPaths("acme", { dataDir: "/d" }));
    const b = Object.values(brandPaths("beta", { dataDir: "/d" }));
    expect(a.filter((x) => typeof x === "string" && b.includes(x) && x !== "acme")).toEqual([]);
  });
  it("refuses a slug that could leave the folder", () => {
    for (const bad of ["../etc", "a/b", "", "A", "new"]) expect(() => brandPaths(bad, { dataDir: "/d" })).toThrow(/Invalid brand slug/);
  });
  it("the Instagram profile is always the brand's own folder, and the template stays addressable", () => {
    expect(brandPaths("acme", { dataDir: "/d" }).profileDir).toBe("/d/brands/acme/profile");
    expect(brandPaths("_template", { dataDir: "/d" }).brandDir).toBe("/d/brands/_template");
  });
  it("reads the Chrome profile root from the environment", () => {
    expect(chromeProfileRoot({})).toBe("/data/chrome-profile");
    expect(chromeProfileRoot({ CHROME_PROFILE: "/old" })).toBe("/old");
    expect(chromeProfileRoot({ CHROME_PROFILE_ROOT: "/new", CHROME_PROFILE: "/old" })).toBe("/new");
  });
  it("brandCtx and the registry agree, and a profile folder named in an old brand.json is ignored", () => {
    const b = writeTestBrand(root, "acme", { instagram: { account: "a", userId: "1", profileDir: "/data/chrome-profile" } });
    expect(reg().paths("acme").profileDir).toBe(join(data, "brands/acme/profile"));
    expect(brandCtx(reg(), "acme")?.brand).toEqual(b);
    expect(brandCtx(reg(), "nope")).toBeNull();
  });
  it("each brand reads its own blog folder, never another brand's", () => {
    expect(blogDirOf("/r", testBrand("acme"))).toBe("/r/sources/acme");
    expect(blogDirOf("/r", testBrand("acme", { sources: { blogDir: "/posts" } }))).toBe("/posts");
  });
});

describe("creating the folders of a brand", () => {
  it("makes every folder and file, fills the template, and registers the brand", () => {
    mkdirSync(join(root, "brand/_template"), { recursive: true });
    writeFileSync(join(root, "brand/_template/style.md"), "# {{BRAND_NAME}} {{WEBSITE}} {{ACCENT_HEX}}\n");
    writeFileSync(join(root, "brand/_template/brand.json"), "{}");
    writeFileSync(join(root, "brand/_template/README.md"), "do not copy");
    writeFileSync(join(root, "brand/_template/logo.png"), "png");
    writeFileSync(join(root, "brand/_template/voice-sample.md"), "do not copy");
    const r = reg().create({ ...defaultBrandValues("acme", "Acme"), website: "acme.example" });
    const p = r.paths;
    for (const d of [p.brandDir, p.identityDir, p.reelsDir, p.dataDir, p.dailyDir, p.analyticsDir, p.ideasDir, p.locksDir, p.profileDir]) expect(existsSync(d), d).toBe(true);
    expect(readFileSync(p.styleMd, "utf8")).toBe("# Acme acme.example #2f6fed\n");
    expect(readFileSync(p.questionsMd, "utf8")).toContain("# Reel questions: Acme");
    // The template has a placeholder logo: a new brand must not inherit it, or every cover would show a blank frame.
    expect(existsSync(p.logo)).toBe(false);
    expect(existsSync(join(p.identityDir, "README.md"))).toBe(false);
    expect(existsSync(join(p.identityDir, "voice-sample.md"))).toBe(false); // the voice guide is in the reel skill now
    expect(existsSync(p.mascotDir)).toBe(false); // the character folder is made only for a brand with a character
    expect(p.questionsMd).toBe(join(data, "brands", "acme", "reel-questions.md"));
    expect(readBrand(data, "acme")?.name).toBe("Acme");
    expect(reg().defaultSlug()).toBe("acme");
    expect(r.created).toContain(p.brandJson);
  });
  it("refuses an invalid brand and a slug that already exists, and never overwrites", () => {
    expect(() => reg().create({ ...defaultBrandValues("acme", "Acme"), colors: { background: "x", text: "x", accent: "x", secondary: "x" } })).toThrow(BrandError);
    reg().create(defaultBrandValues("acme", "Acme"));
    writeFileSync(join(data, "brands/acme/identity/style.md"), "mine");
    expect(() => reg().create(defaultBrandValues("acme", "Other"))).toThrow(/already exists/);
    expect(readFileSync(join(data, "brands/acme/identity/style.md"), "utf8")).toBe("mine");
  });
  it("keeps files it finds in a half-made folder and still works without a template", () => {
    mkdirSync(join(data, "brands/acme"), { recursive: true });
    writeFileSync(join(data, "brands/acme/reel-questions.md"), "my list");
    reg().create(defaultBrandValues("acme", "Acme"));
    expect(readFileSync(join(data, "brands/acme/reel-questions.md"), "utf8")).toBe("my list");
  });
});

describe("offer rule of a brand", () => {
  it("is off without a rule and follows the brand's own rule otherwise", () => {
    expect(offerOf(null)).toBe(NO_OFFER);
    expect(offerOf(testBrand("a"))).toEqual({ lastDay: null, pattern: null });
    const cfg = offerOf(testBrand("a", { offer: { lastDay: "2026-11-30", regex: "code-[a-z]+" } }));
    expect(afterOffer("2026-12-01T10:00", cfg)).toBe(true);
    expect(afterOffer("2026-11-30T23:00", cfg)).toBe(false);
    expect(isOfferLine("use CODE-abc now", cfg)).toBe(true);
    expect(isOfferLine("\u{1F381} gift", cfg)).toBe(true);
    expect(isOfferLine("plain line", cfg)).toBe(false);
    expect(isOfferLine("\u{1F381} gift", NO_OFFER)).toBe(false);
    expect(humanDay("2026-11-30")).toBe("30 November 2026");
  });
});
