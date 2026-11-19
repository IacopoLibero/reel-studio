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
const reg = () => new BrandRegistry({ root, dataDir: data, chromeRoot: join(tmp, "chrome") });

describe("listing and loading", () => {
  it("lists the brands that have a valid brand.json, sorted, never the template or hidden folders", () => {
    writeTestBrand(root, "zeta"); writeTestBrand(root, "alpha");
    mkdirSync(join(root, "brand/_template"), { recursive: true }); writeFileSync(join(root, "brand/_template/brand.json"), "{}");
    mkdirSync(join(root, "brand/.hidden"), { recursive: true });
    mkdirSync(join(root, "brand/nojson"), { recursive: true });
    expect(listBrandSlugs(root)).toEqual(["alpha", "zeta"]);
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
    expect(readBrandFile(root, "nope")).toEqual({ ok: false, errors: ["brand.json: not found"] });
    mkdirSync(join(root, "brand/broken"), { recursive: true });
    writeFileSync(join(root, "brand/broken/brand.json"), "{ not json");
    expect(readBrandFile(root, "broken")).toEqual({ ok: false, errors: ["brand.json: is not valid JSON"] });
    writeFileSync(join(root, "brand/broken/brand.json"), JSON.stringify(testBrand("other")));
    expect((readBrandFile(root, "broken") as { errors: string[] }).errors[0]).toMatch(/folder is "broken"/);
    expect((readBrandFile(root, "../x") as { errors: string[] }).errors[0]).toMatch(/not a valid brand slug/);
    expect(readBrand(root, "broken")).toBeNull();
  });
  it("writes brand.json atomically and refuses an invalid brand", () => {
    const b = testBrand("acme");
    writeBrand(root, { ...b, name: "Acme 2" });
    expect(readBrand(root, "acme")?.name).toBe("Acme 2");
    expect(existsSync(join(root, "brand/acme/brand.json.tmp"))).toBe(false);
    expect(() => writeBrand(root, { ...b, colors: { ...b.colors, accent: "nope" } })).toThrow();
  });
});

describe("paths", () => {
  it("puts everything of a brand under its own folders", () => {
    const p = brandPaths("acme", { root: "/r", dataDir: "/r/platform/data", chromeRoot: "/chrome" });
    expect(p).toMatchObject({
      brandDir: "/r/brand/acme", brandJson: "/r/brand/acme/brand.json", questionsMd: "/r/brand/acme/reel-questions.md", reelsDir: "/r/reels/acme",
      dataDir: "/r/platform/data/brands/acme", scheduledFile: "/r/platform/data/brands/acme/scheduled.json", settingsFile: "/r/platform/data/brands/acme/settings.json",
      dailyDir: "/r/platform/data/brands/acme/daily", analyticsDir: "/r/platform/data/brands/acme/analytics", ideasDir: "/r/platform/data/brands/acme/ideas",
      seriesFile: "/r/platform/data/brands/acme/series.json", locksDir: "/r/platform/data/brands/acme/locks", notificationsFile: "/r/platform/data/brands/acme/notifications.json",
      profileDir: "/chrome/acme",
    });
  });
  it("two brands never share a path", () => {
    const a = Object.values(brandPaths("acme", { root: "/r", dataDir: "/d", chromeRoot: "/c" }));
    const b = Object.values(brandPaths("beta", { root: "/r", dataDir: "/d", chromeRoot: "/c" }));
    expect(a.filter((x) => typeof x === "string" && b.includes(x) && x !== "acme")).toEqual([]);
  });
  it("refuses a slug that could leave the folder", () => {
    for (const bad of ["../etc", "a/b", "", "A", "new"]) expect(() => brandPaths(bad, { root: "/r", dataDir: "/d" })).toThrow(/Invalid brand slug/);
  });
  it("uses the brand's own profile folder when it has one, the template stays addressable", () => {
    expect(brandPaths("acme", { root: "/r", dataDir: "/d", chromeRoot: "/c", profileDir: "/data/chrome-profile" }).profileDir).toBe("/data/chrome-profile");
    expect(brandPaths("_template", { root: "/r", dataDir: "/d" }).brandDir).toBe("/r/brand/_template");
  });
  it("reads the Chrome profile root from the environment", () => {
    expect(chromeProfileRoot({})).toBe("/data/chrome-profile");
    expect(chromeProfileRoot({ CHROME_PROFILE: "/old" })).toBe("/old");
    expect(chromeProfileRoot({ CHROME_PROFILE_ROOT: "/new", CHROME_PROFILE: "/old" })).toBe("/new");
  });
  it("brandCtx and the registry agree, and the brand's profile folder is honoured", () => {
    const b = writeTestBrand(root, "acme", { instagram: { account: "a", userId: "1", profileDir: "/data/chrome-profile" } });
    expect(reg().paths("acme").profileDir).toBe("/data/chrome-profile");
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
    const r = reg().create({ ...defaultBrandValues("acme", "Acme"), website: "acme.example" });
    const p = r.paths;
    for (const d of [p.brandDir, p.voiceDir, p.reelsDir, p.dataDir, p.dailyDir, p.analyticsDir, p.ideasDir, p.locksDir, p.shotsDir, p.profileDir]) expect(existsSync(d), d).toBe(true);
    expect(readFileSync(p.styleMd, "utf8")).toBe("# Acme acme.example #2f6fed\n");
    expect(readFileSync(p.questionsMd, "utf8")).toContain("# Reel questions: Acme");
    expect(existsSync(p.logo)).toBe(true);
    expect(existsSync(join(p.brandDir, "README.md"))).toBe(false);
    expect(readBrand(root, "acme")?.name).toBe("Acme");
    expect(reg().defaultSlug()).toBe("acme");
    expect(r.created).toContain(p.brandJson);
  });
  it("refuses an invalid brand and a slug that already exists, and never overwrites", () => {
    expect(() => reg().create({ ...defaultBrandValues("acme", "Acme"), colors: { background: "x", text: "x", accent: "x", secondary: "x" } })).toThrow(BrandError);
    reg().create(defaultBrandValues("acme", "Acme"));
    writeFileSync(join(root, "brand/acme/style.md"), "mine");
    expect(() => reg().create(defaultBrandValues("acme", "Other"))).toThrow(/already exists/);
    expect(readFileSync(join(root, "brand/acme/style.md"), "utf8")).toBe("mine");
  });
  it("keeps files it finds in a half-made folder and still works without a template", () => {
    mkdirSync(join(root, "brand/acme"), { recursive: true });
    writeFileSync(join(root, "brand/acme/reel-questions.md"), "my list");
    reg().create(defaultBrandValues("acme", "Acme"));
    expect(readFileSync(join(root, "brand/acme/reel-questions.md"), "utf8")).toBe("my list");
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
