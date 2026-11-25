import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { brandCtx } from "../src/brands/context.js";
import { readAltTexts } from "../src/carousels/alt.js";
import { scanCarousels } from "../src/carousels/scanner.js";
import { buildSpec, createSchema } from "../src/jobs/create.js";
import { DEFAULT_SETTINGS } from "../src/settings.js";
import { type Env, makeEnv } from "./helpers/creator.js";
import { writeTestBrand } from "./helpers/brand.js";

let env: Env;
beforeEach(() => { env = makeEnv({}); writeTestBrand(env.root, "acme", { name: "Acme" }, undefined, env.data); });
afterEach(() => rmSync(env.tmp, { recursive: true, force: true }));
const carousels = () => join(env.data, "brands/acme/carousels");
const make = (folder: string, alt?: unknown) => {
  const d = join(carousels(), folder);
  mkdirSync(d, { recursive: true });
  for (const n of [1, 2, 3]) writeFileSync(join(d, `slide-${n}.png`), "png");
  writeFileSync(join(d, "caption.md"), "Hook 👇\n\n#tips\n");
  if (alt !== undefined) writeFileSync(join(d, "alt.json"), JSON.stringify(alt));
  return d;
};
const NOW = new Date("2026-11-25T08:00:00Z");
const deps = (jobs: never[] = []) => ({ root: env.root, brand: brandCtx(env.reg, "acme"), settings: DEFAULT_SETTINGS, jobs, now: NOW });
const body = (reel: string, time = "17:30") => createSchema.parse({ type: "instagram.schedule", params: { reel, date: "2026-12-02", time } });

describe("alt texts", () => {
  it("reads one text per slide and cuts a long one to 100 characters", () => {
    const d = make("0-a", ["One", "Two", "x".repeat(150)]);
    const alts = readAltTexts(d, 3) as string[];
    expect(alts.slice(0, 2)).toEqual(["One", "Two"]);
    expect(alts[2]).toHaveLength(100);
  });
  it("is null when the count does not match the slides or the file is missing", () => {
    expect(readAltTexts(make("1-b", ["only one"]), 3)).toBeNull();
    expect(readAltTexts(make("2-c"), 3)).toBeNull();
  });
});

describe("scheduling a carousel", () => {
  it("builds a job with the slides in order, the caption folder and the alt texts", () => {
    const d = make("0-price", ["a1", "a2", "a3"]);
    const spec = buildSpec(body("acme/carousels/0-price"), deps());
    expect(spec).toMatchObject({ type: "instagram.schedule", title: expect.stringContaining("Carousel 0"), params: { reel: "acme/carousels/0-price", slot: "2026-12-02T17:30", reelDir: d, slides: ["slide-1.png", "slide-2.png", "slide-3.png"], alts: ["a1", "a2", "a3"] } });
    expect(spec.steps).toContain("Upload images");
  });
  it("still schedules a carousel without alt texts, and the scan says so", () => {
    make("1-old");
    const spec = buildSpec(body("acme/carousels/1-old"), deps());
    expect(spec.params).not.toHaveProperty("alts");
    expect(scanCarousels(carousels(), "acme").find((c) => c.folder === "1-old")).toMatchObject({ hasAlt: false, state: "to-schedule" });
  });
  it("refuses a missing carousel, a slot that is too soon and a slot already used", () => {
    make("2-x", ["a", "b", "c"]);
    expect(() => buildSpec(body("acme/carousels/9-none"), deps())).toThrow(/not found/);
    expect(() => buildSpec(createSchema.parse({ type: "instagram.schedule", params: { reel: "acme/carousels/2-x", date: "2026-11-25", time: "08:10" } }), deps())).toThrow(/20 minutes/);
    const queued = [{ type: "instagram.schedule", brand: "acme", status: "queued", params: { reel: "acme/carousels/other", date: "2026-12-02", time: "17:30" } }] as never[];
    expect(() => buildSpec(body("acme/carousels/2-x"), deps(queued))).toThrow(/slot/);
  });
  it("shows the state: scheduled, then posted once the slot has passed", () => {
    make("3-s", ["a", "b", "c"]);
    const sched = { "acme/carousels/3-s": { at: "2026-12-02 17:30", status: "scheduled" } };
    expect(scanCarousels(carousels(), "acme", sched, new Set(), "2026-12-01 10:00")[0]?.state).toBe("scheduled");
    expect(scanCarousels(carousels(), "acme", sched, new Set(), "2026-12-02 18:00")[0]?.state).toBe("posted");
  });
});
