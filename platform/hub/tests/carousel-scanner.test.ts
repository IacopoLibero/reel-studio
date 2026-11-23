import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readCarouselDetail, resolveCarouselFile, scanCarousels, slideFiles } from "../src/carousels/scanner.js";
import { carouselStepOf, missingCarouselOutputs } from "../src/carousels/stream.js";
import { buildCarouselPrompt, carouselDenied } from "../src/carousels/prompt.js";
import { allocateReelFolder } from "../src/factory/allocator.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "car-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const make = (folder: string, files: Record<string, string>) => { const d = join(dir, folder); mkdirSync(d, { recursive: true }); for (const [n, c] of Object.entries(files)) writeFileSync(join(d, n), c); };

describe("the carousels folder", () => {
  it("lists carousels in order with their slides, style and caption", () => {
    make("1-second", { "slide-1.png": "x", "slide-2.png": "x", "caption.md": "Hook 👇\n\nmore", "carousel.json": JSON.stringify({ style: "3d", topic: "A topic", title: "T" }) });
    make("0-first", { "slide-1.png": "x" });
    make("not-a-carousel", {});
    const list = scanCarousels(dir, "acme");
    expect(list.map((c) => c.folder)).toEqual(["0-first", "1-second"]);
    expect(list[1]).toMatchObject({ key: "acme/1-second", n: 1, name: "second", style: "3d", topic: "A topic", slides: ["slide-1.png", "slide-2.png"], hasCaption: true, captionStart: "Hook 👇" });
    expect(list[0]).toMatchObject({ style: "2d", slides: ["slide-1.png"], hasCaption: false });
  });
  it("counts slides up to the first gap", () => {
    make("0-x", { "slide-1.png": "x", "slide-2.png": "x", "slide-4.png": "x" });
    expect(slideFiles(join(dir, "0-x"))).toEqual(["slide-1.png", "slide-2.png"]);
    expect(slideFiles(join(dir, "missing"))).toEqual([]);
  });
  it("gives the detail with caption, plan and files, and refuses unsafe names", () => {
    make("0-x", { "slide-1.png": "x", "caption.md": "cap", "plan.md": "plan" });
    const d = readCarouselDetail(dir, "0-x", "acme");
    expect(d).toMatchObject({ caption: "cap", plan: "plan" });
    expect(d?.files.map((f) => f.name)).toEqual(["caption.md", "plan.md", "slide-1.png"]);
    expect(readCarouselDetail(dir, "../etc", "acme")).toBeNull();
    expect(readCarouselDetail(dir, "nope", "acme")).toBeNull();
  });
  it("serves only slides and the caption of a real folder", () => {
    make("0-x", { "slide-1.png": "x", "caption.md": "cap", "secret.txt": "s" });
    expect(resolveCarouselFile(dir, "0-x", "slide-1.png")).toBe(join(dir, "0-x", "slide-1.png"));
    expect(resolveCarouselFile(dir, "0-x", "caption.md")).toBeTruthy();
    for (const bad of ["secret.txt", "../0-x/slide-1.png", "slide-1.png.bak", "slide-a.png"]) expect(resolveCarouselFile(dir, "0-x", bad)).toBeNull();
    expect(resolveCarouselFile(dir, "..", "slide-1.png")).toBeNull();
    expect(resolveCarouselFile(dir, "9-none", "slide-1.png")).toBeNull();
  });
  it("allocates its own numbers, apart from the reels of the brand", async () => {
    const locks = join(dir, "locks");
    const a = await allocateReelFolder(join(dir, "c"), "Why bread goes hard", locks, "acme", "carousel");
    const b = await allocateReelFolder(join(dir, "c"), "Another topic", locks, "acme", "carousel");
    expect([a.n, b.n]).toEqual([0, 1]);
    expect(a.folder).toBe("0-bread-goes-hard");
  });
});

describe("progress and outputs", () => {
  it("moves forward with the files that appear", () => {
    expect(carouselStepOf([], 5)).toBe(0);
    expect(carouselStepOf(["plan.md"], 5)).toBe(1);
    expect(carouselStepOf(["plan.md", "code"], 5)).toBe(2);
    expect(carouselStepOf(["plan.md", "slide-1.png"], 5)).toBe(2);
    expect(carouselStepOf(["plan.md", ...[1, 2, 3, 4, 5].map((i) => `slide-${i}.png`)], 5)).toBe(3);
    expect(carouselStepOf(["plan.md", "caption.md"], 5)).toBe(4);
  });
  it("names what is missing", () => {
    expect(missingCarouselOutputs(["plan.md", "caption.md", "slide-1.png", "slide-2.png"], 3)).toEqual(["slide-3.png"]);
    expect(missingCarouselOutputs([], 2)).toEqual(["slide-1.png", "slide-2.png", "caption.md", "plan.md"]);
  });
});

describe("the prompt", () => {
  const base = { root: "/r", brand: "acme", brandDir: "/d/brands/acme", folder: "3-topic", topic: "Why a QR menu", style: "2d" as const, slides: 5, closing: "A" as const, productDir: null };
  it("names the folder, the slides, the style, both Ootto skills and the factory rules", () => {
    const p = buildCarouselPrompt(base);
    for (const x of ["/r/.claude/skills/carousel/SKILL.md", "/d/brands/acme/carousels/3-topic", "Slides: 5", "Style: 2D", "ootto-viral-carousel", "ootto-carousel-builder", "slot.sh render 3", "embed-assets.mjs", "Never post"]) expect(p).toContain(x);
    expect(p).toContain("slide-5.png");
    expect(p).toContain("option A");
  });
  it("describes the 3D style with Blender and the checks", () => {
    const p = buildCarouselPrompt({ ...base, style: "3d", closing: "B" });
    expect(p).toContain("Style: 3D");
    expect(p).toContain("/r/scripts/carousel/blender/");
    expect(p).toContain("four-view");
    expect(p).toContain("option B");
  });
  it("tells the product folder is read-only and denies writes there", () => {
    const p = buildCarouselPrompt({ ...base, productDir: "/p/Product" });
    expect(p).toContain("The brand's product is in /p/Product");
    expect(p).toContain("never change anything in it");
    expect(carouselDenied("/p/Product")).toContain("Write(//p/Product/**)");
    expect(carouselDenied(null)).not.toContain("Write(//");
  });
  it("adds the note of a redo", () => { expect(buildCarouselPrompt({ ...base, note: "bigger titles" })).toContain('"bigger titles"'); });
});
