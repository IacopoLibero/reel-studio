import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { carouselMake } from "../src/carousels/handler.js";
import { buildSpec, createSchema } from "../src/jobs/create.js";
import { brandCtx } from "../src/brands/context.js";
import { DEFAULT_SETTINGS } from "../src/settings.js";
import { scanCarousels } from "../src/carousels/scanner.js";
import { type Env, job, makeEnv } from "./helpers/creator.js";
import { writeTestBrand } from "./helpers/brand.js";

const FAKE = join(import.meta.dirname, "fixtures/fake-claude-carousel.mjs");
let env: Env; let n = 0;
beforeEach(() => { env = makeEnv({ claudeBin: FAKE }); writeTestBrand(env.root, "acme", { name: "Acme" }, undefined, env.data); });
afterEach(() => { delete process.env.FAKE_MODE; rmSync(env.tmp, { recursive: true, force: true }); });
const run = (params: Record<string, unknown> = {}) => { const j = { ...job("carousel.make", "acme", { topic: "Why a QR menu", style: "2d", slides: 5, closing: "B", ...params }), id: `00000000-0000-0000-0000-${String(++n).padStart(12, "0")}` }; return carouselMake(j, env.ctx(j)); };
const dir = (folder: string) => join(env.data, "brands/acme/carousels", folder);

describe("carousel.make with a fake AI tool", () => {
  it("makes the folder, runs the tool, checks the outputs and says which skills it used", async () => {
    const r = await run();
    expect(r).toMatchObject({ folder: "0-qr-menu", key: "acme/0-qr-menu", style: "2d", slides: 5, skillsUsed: ["ootto-viral-carousel", "ootto-carousel-builder"] });
    for (const f of ["slide-1.png", "slide-5.png", "plan.md", "caption.md", "carousel.json"]) expect(existsSync(join(dir("0-qr-menu"), f))).toBe(true);
    expect(scanCarousels(join(env.data, "brands/acme/carousels"), "acme")[0]).toMatchObject({ style: "2d", slides: expect.arrayContaining(["slide-1.png"]) });
    expect(env.patches.map((p) => p.step).filter(Boolean)).toContain("Plan");
    expect(env.patches.at(-1)).toMatchObject({ step: "Done", progress: 1 });
  });
  it("numbers the next carousel and keeps the 3D style the job asked for", async () => {
    await run();
    const r = await run({ style: "3d", slides: 4 });
    expect(r).toMatchObject({ folder: "1-qr-menu", style: "3d", slides: 4 });
    expect(JSON.parse(readFileSync(join(dir("1-qr-menu"), "carousel.json"), "utf8")).style).toBe("3d");
  });
  it("makes it again in the same folder for a redo", async () => {
    await run();
    const r = await run({ rerunFolder: "0-qr-menu", note: "bigger titles" });
    expect(r.folder).toBe("0-qr-menu");
  });
  it("fails when a required Ootto skill was not called", async () => {
    process.env.FAKE_MODE = "noskill";
    await expect(run()).rejects.toThrow(/did not call ootto-viral-carousel and ootto-carousel-builder/);
    process.env.FAKE_MODE = "oneskill";
    await expect(run()).rejects.toThrow(/did not call ootto-carousel-builder/);
  });
  it("fails clearly when slides are missing or the tool errors", async () => {
    process.env.FAKE_MODE = "noslides";
    await expect(run()).rejects.toThrow(/missing slide-1\.png, slide-2\.png/);
    process.env.FAKE_MODE = "error";
    await expect(run()).rejects.toThrow(/Carousel not finished/);
  });
  it("needs a brand", async () => {
    const j = job("carousel.make", "acme", { topic: "x y z w v", style: "2d", slides: 5, closing: "B" });
    await expect(carouselMake(j, { ...env.ctx(j), brand: null })).rejects.toThrow(/needs a brand/);
  });
});

describe("creating the job", () => {
  const mk = () => ({ root: env.root, brand: brandCtx(env.reg, "acme"), settings: DEFAULT_SETTINGS, jobs: [] });
  it("accepts a topic with a style and a slide count, with defaults", () => {
    const body = createSchema.parse({ type: "carousel.make", params: { topic: "Why a QR menu" } });
    expect(body.params).toMatchObject({ style: "2d", slides: 5, closing: "B" });
    const spec = buildSpec(createSchema.parse({ type: "carousel.make", params: { topic: "Why a QR menu", style: "3d", slides: 6 } }), mk());
    expect(spec).toMatchObject({ type: "carousel.make", title: "Carousel (3D): Why a QR menu", params: { style: "3d", slides: 6 } });
    expect(spec.steps).toEqual(["Plan", "Build", "Render", "Checks", "Caption", "Done"]);
  });
  it("refuses a short topic, a wrong style or too many slides", () => {
    for (const params of [{ topic: "no" }, { topic: "Why a QR menu", style: "4d" }, { topic: "Why a QR menu", slides: 12 }, { topic: "Why a QR menu", slides: 2 }]) expect(createSchema.safeParse({ type: "carousel.make", params }).success).toBe(false);
  });
  it("makes a carousel again only when it exists and is not already being made", async () => {
    const body = createSchema.parse({ type: "carousel.make", params: { topic: "Why a QR menu", rerun: { folder: "0-qr-menu", note: "bigger" } } });
    expect(() => buildSpec(body, mk())).toThrow(/not found/);
    await run();
    expect(buildSpec(body, mk()).params).toMatchObject({ rerunFolder: "0-qr-menu", note: "bigger" });
    const busy = { ...job("carousel.make", "acme", { rerunFolder: "0-qr-menu" }), status: "running" as const };
    expect(() => buildSpec(body, { ...mk(), jobs: [busy] })).toThrow(/already being made again/);
  });
});
