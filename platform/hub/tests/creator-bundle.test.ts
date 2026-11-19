import { mkdtempSync, readdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BundleError, bundleDir, cleanPath, inspectBundle, normalizeBundle, stageBundle } from "../src/creator/bundle.js";
import { testBrand } from "./helpers/brand.js";
import { PNG, SVG, WAV } from "./helpers/zip.js";

const file = (path: string, data: Buffer | string) => ({ path, data: Buffer.isBuffer(data) ? data : Buffer.from(data) });
const json = (o: object) => JSON.stringify(o);
const brandFile = (over: object = {}) => json({ ...testBrand("acme-bakery", { name: "Acme Bakery" }), ...over });

describe("bundle paths", () => {
  it("refuses traversal, absolute and odd paths", () => {
    for (const bad of ["../x", "a/../../x", "/etc/passwd", "a\\b", "C:/x", "a/./b", "", "a\u0000b"]) expect(() => cleanPath(bad), bad).toThrow(BundleError);
    expect(cleanPath("voice//a.wav")).toBe("voice/a.wav");
  });
  it("refuses oversized or duplicate input and strips one wrapping folder", () => {
    expect(() => normalizeBundle([])).toThrow(/empty/);
    expect(() => normalizeBundle([file("a", "1"), file("A", "2")])).toThrow(/twice/);
    expect(() => normalizeBundle([file("a", Buffer.alloc(26_000_000))])).toThrow(/too big/);
    expect([...normalizeBundle([file("my/brand.json", "{}"), file("my/style.md", "x")]).keys()]).toEqual(["brand.json", "style.md"]);
    expect([...normalizeBundle([file("brand.json", "{}"), file("voice/a.wav", "x")]).keys()]).toEqual(["brand.json", "voice/a.wav"]);
  });
});

describe("inspecting a brand folder", () => {
  const run = (files: ReturnType<typeof file>[], taken: string[] = [], hasMascot = false) => inspectBundle(normalizeBundle(files), { takenSlugs: taken, hasMascot: () => hasMascot });

  it("accepts a folder with brand.json and keeps only the known files", () => {
    const r = run([file("brand.json", brandFile()), file("style.md", "# S"), file("reel-questions.md", "## To do\n"), file("logo.svg", SVG), file("secret.env", "TOKEN=1"), file("node_modules/x.js", "1")]);
    expect(r.preview).toMatchObject({ styleMd: true, questions: true, logo: "svg", voice: false });
    expect(r.preview.brand.slug).toBe("acme-bakery");
    expect([...r.kept.keys()].sort()).toEqual(["logo.svg", "reel-questions.md", "style.md"]);
    expect(r.preview.warnings.join(" ")).toContain("Not imported");
  });
  it("never reuses a taken slug: the brand gets a new one", () => {
    const r = run([file("brand.json", brandFile())], ["acme-bakery"]);
    expect(r.preview.brand.slug).toBe("acme-bakery-2");
    expect(r.preview.warnings[0]).toContain("already exists");
    expect(run([file("brand.json", brandFile({ slug: "api" }))]).preview.brand.slug).not.toBe("api");
  });
  it("drops what belongs to another machine", () => {
    const r = run([file("brand.json", brandFile({ instagram: { account: "a", userId: "1", profileDir: "/srv/other/profile" }, sources: { blogDir: "/srv/other/blog" }, character: { enabled: true, id: "bun", name: "Bun" } }))]);
    expect(r.preview.brand.instagram.profileDir).toBeNull();
    expect(r.preview.brand.sources.blogDir).toBeNull();
    expect(r.preview.brand.character.enabled).toBe(false);
    expect(run([file("brand.json", brandFile({ character: { enabled: true, id: "bun", name: "Bun" } }))], [], true).preview.brand.character.enabled).toBe(true);
  });
  it("keeps the voice sample only when it is in the folder", () => {
    const voice = { engine: "voxcpm2", sample: "voice/v.wav", sampleText: "voice/v.txt" };
    expect(run([file("brand.json", brandFile({ voice })), file("voice/v.wav", WAV), file("voice/v.txt", "hi")]).preview.voice).toBe(true);
    const r = run([file("brand.json", brandFile({ voice }))]);
    expect(r.preview.voice).toBe(false);
    expect(r.preview.brand.voice.sample).toBeNull();
  });
  it("refuses a missing, broken or invalid brand.json and a bad logo or voice file", () => {
    expect(() => run([file("style.md", "x")])).toThrow(/no brand.json/);
    expect(() => run([file("brand.json", "{nope")])).toThrow(/not valid JSON/);
    expect(() => run([file("brand.json", "[]")])).toThrow(/one object/);
    expect(() => run([file("brand.json", brandFile({ colors: { background: "red", text: "#000000", accent: "#000000", secondary: "#000000" } }))])).toThrow(/colors/);
    expect(() => run([file("brand.json", brandFile()), file("logo.png", "not a png")])).toThrow(/logo.png/);
    expect(() => run([file("brand.json", brandFile()), file("voice/a.wav", "nope")])).toThrow(/voice\/a.wav/);
    expect(() => run([file("brand.json", brandFile()), file("style.md", "x".repeat(200_000))])).toThrow(/too big/);
    expect(() => run([file("brand.json", "x".repeat(200_000))])).toThrow(/too big/);
  });
  it("accepts a png logo", () => { expect(run([file("brand.json", brandFile()), file("logo.png", PNG)]).preview.logo).toBe("png"); });
});

describe("staging", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "stage-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  it("writes the kept files under a random id and finds them again", () => {
    const id = stageBundle(dir, new Map([["style.md", Buffer.from("# S")], ["voice/v.wav", WAV]]));
    const d = bundleDir(dir, id) as string;
    expect(readFileSync(join(d, "style.md"), "utf8")).toBe("# S");
    expect(existsSync(join(d, "voice/v.wav"))).toBe(true);
    expect(bundleDir(dir, "../x")).toBeNull();
    expect(readdirSync(dir)).toHaveLength(1);
  });
});
