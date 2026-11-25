import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { brandCtx } from "../src/brands/context.js";
import { carouselEdit } from "../src/carousels/edit-handler.js";
import { buildCarouselEditPrompt } from "../src/carousels/edit-prompt.js";
import { buildSpec, createSchema } from "../src/jobs/create.js";
import { DEFAULT_SETTINGS } from "../src/settings.js";
import { type Env, job, makeEnv } from "./helpers/creator.js";
import { writeTestBrand } from "./helpers/brand.js";

const FAKE = join(import.meta.dirname, "fixtures/fake-claude-carousel-edit.mjs");
let env: Env;
const png = (tag: string) => { const b = Buffer.alloc(32); b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(1080, 16); b.writeUInt32BE(1350, 20); b.write(tag, 24, "latin1"); return b; };
const dir = () => join(env.data, "brands/acme/carousels/0-price");
beforeEach(() => {
  env = makeEnv({ claudeBin: FAKE });
  writeTestBrand(env.root, "acme", { name: "Acme" }, undefined, env.data);
  mkdirSync(join(dir(), "code"), { recursive: true });
  for (let i = 1; i <= 3; i++) writeFileSync(join(dir(), `slide-${i}.png`), png(`old${i}`));
  writeFileSync(join(dir(), "caption.md"), "Hook\n"); writeFileSync(join(dir(), "alt.json"), JSON.stringify(["a", "b", "c"]));
  writeFileSync(join(dir(), "carousel.json"), JSON.stringify({ style: "2d", topic: "t", title: "Price" }));
});
afterEach(() => { delete process.env.FAKE_MODE; rmSync(env.tmp, { recursive: true, force: true }); });
const run = (params: Record<string, unknown> = {}) => { const j = job("carousel.edit", "acme", { folder: "0-price", slide: 2, message: "bigger title", ...params }); return carouselEdit(j, env.ctx(j)); };
const bytes = (n: number) => readFileSync(join(dir(), `slide-${n}.png`));

describe("carousel.edit with a fake AI tool", () => {
  it("changes only the chosen slide and keeps a version of the old ones", async () => {
    const old = [1, 2, 3].map(bytes);
    const r = await run();
    expect(r).toMatchObject({ folder: "0-price", slide: 2, changed: true, restored: [] });
    expect(bytes(2).equals(old[1] as Buffer)).toBe(false);
    expect(bytes(1).equals(old[0] as Buffer)).toBe(true);
    expect(bytes(3).equals(old[2] as Buffer)).toBe(true);
    const versions = readdirSync(join(dir(), "versions"));
    expect(versions).toHaveLength(1);
    expect(readFileSync(join(dir(), "versions", versions[0] as string, "slide-2.png")).equals(old[1] as Buffer)).toBe(true);
    expect(env.patches.at(-1)).toMatchObject({ step: "Done", progress: 1 });
  });
  it("puts back another slide that the run changed", async () => {
    process.env.FAKE_MODE = "others";
    const old3 = bytes(3);
    const r = await run();
    expect(r.restored).toEqual(["slide-3.png"]);
    expect(bytes(3).equals(old3)).toBe(true);
  });
  it("restores the slide and fails when the new one has the wrong size", async () => {
    process.env.FAKE_MODE = "wrongsize";
    const old2 = bytes(2);
    await expect(run()).rejects.toThrow(/800 x 800/);
    expect(bytes(2).equals(old2)).toBe(true);
  });
  it("fails when the tool reports an error, and says when the slide came out the same", async () => {
    process.env.FAKE_MODE = "error";
    await expect(run()).rejects.toThrow(/boom/);
    process.env.FAKE_MODE = "same";
    expect(((await run()).summary as string)).toMatch(/same as before/);
  });
  it("says what is missing, before any run, when the source files are not in the folder", async () => {
    rmSync(join(dir(), "code"), { recursive: true });
    await expect(run()).rejects.toThrow(/code is not in its folder.*Make it again/);
    expect(existsSync(join(dir(), "versions"))).toBe(false);
    writeFileSync(join(dir(), "carousel.json"), JSON.stringify({ style: "3d", topic: "t", title: "Price" }));
    mkdirSync(join(dir(), "code"));
    await expect(run()).rejects.toThrow(/scene\.py, panorama\.png are not in its folder/);
  });
  it("refuses a slide the carousel does not have", async () => {
    await expect(run({ slide: 7 })).rejects.toThrow(/no slide 7/);
    expect(existsSync(join(dir(), "versions"))).toBe(false);
  });
});

describe("the job and its prompt", () => {
  const mk = (jobs: never[] = []) => ({ root: env.root, brand: brandCtx(env.reg, "acme"), settings: DEFAULT_SETTINGS, jobs });
  const body = (slide = 2) => createSchema.parse({ type: "carousel.edit", params: { folder: "0-price", slide, message: "bigger title" } });
  it("builds a job and refuses a missing slide, a missing carousel or a second change at once", () => {
    expect(buildSpec(body(), mk())).toMatchObject({ type: "carousel.edit", params: { folder: "0-price", slide: 2 } });
    expect(() => buildSpec(body(5), mk())).toThrow(/no slide 5/);
    expect(() => buildSpec(createSchema.parse({ type: "carousel.edit", params: { folder: "9-none", slide: 1, message: "bigger title" } }), mk())).toThrow(/not found/);
    const busy = [{ type: "carousel.edit", brand: "acme", status: "running", params: { folder: "0-price" } }] as never[];
    expect(() => buildSpec(body(), mk(busy))).toThrow(/being changed/);
    expect(() => createSchema.parse({ type: "carousel.edit", params: { folder: "0-price", slide: 0, message: "x y z" } })).toThrow();
  });
  it("tells the tool to touch one slide, to keep the others and to update the alt text", () => {
    const p = buildCarouselEditPrompt({ root: "/r", brand: "acme", brandDir: "/b", folder: "0-price", style: "2d", slide: 2, slides: 5, message: "bigger title", scheduled: "2026-12-02 17:30" });
    expect(p).toContain("Change slide 2 only: /b/carousels/0-price/slide-2.png");
    expect(p).toMatch(/byte for byte/); expect(p).toContain("alt.json"); expect(p).toContain("does not change Instagram's copy");
  });
});
