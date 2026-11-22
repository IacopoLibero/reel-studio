import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSpec, createSchema, JobRequestError, type Deps } from "../src/jobs/create.js";
import { DEFAULT_SETTINGS } from "../src/settings.js";
import type { Job } from "../src/shared/types.js";
import { testRegistry } from "./helpers/brand.js";

let tmp: string, d: Omit<Deps, "jobs">;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "edit-spec-"));
  const { ctx } = testRegistry(join(tmp, "root"), join(tmp, "data"));
  const reel = join(ctx.paths.reelsDir, "3-half-loaf"); mkdirSync(reel, { recursive: true });
  writeFileSync(join(reel, "a.mp4"), "v"); writeFileSync(join(reel, "caption.md"), "c"); writeFileSync(join(reel, "cover.png"), "p");
  d = { root: join(tmp, "root"), brand: ctx, settings: DEFAULT_SETTINGS };
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const body = (over: Record<string, unknown> = {}) => createSchema.parse({ type: "reel.edit", params: { folder: "3-half-loaf", message: "Make the hook bigger", ...over } });
const active = (type: Job["type"], params: Record<string, unknown>, status: Job["status"] = "running"): Job => ({ id: "x", type, brand: "acme", title: "t", status, progress: 0, step: "", steps: [], stepIndex: 0, log: [], params, createdAt: "", startedAt: null, finishedAt: null, result: {}, error: null });

describe("reel.edit job request", () => {
  it("accepts a folder and a message, and builds a job for the brand", () => {
    const spec = buildSpec(body(), { ...d, jobs: [] });
    expect(spec).toMatchObject({ type: "reel.edit", brand: "acme", params: { folder: "3-half-loaf", message: "Make the hook bigger" } });
    expect(spec.title).toMatch(/3/);
    expect(spec.steps).toEqual(["Reading the reel", "Changing it", "Rendering", "Checks", "Done"]);
  });
  it("refuses an empty message, a very long one, and a folder name that is not a reel folder", () => {
    expect(() => body({ message: "   " })).toThrow();
    expect(() => body({ message: "x".repeat(4001) })).toThrow();
    expect(() => body({ folder: "../etc" })).toThrow();
  });
  it("refuses a reel that does not exist", () => {
    expect(() => buildSpec(body({ folder: "9-nope" }), { ...d, jobs: [] })).toThrow(/not found/i);
  });
  it("refuses a second change to the same reel while one is queued or running", () => {
    for (const status of ["queued", "running"] as const) {
      expect(() => buildSpec(body(), { ...d, jobs: [active("reel.edit", { folder: "3-half-loaf" }, status)] })).toThrow(JobRequestError);
    }
    expect(() => buildSpec(body(), { ...d, jobs: [active("reel.edit", { folder: "3-half-loaf" }, "done")] })).not.toThrow();
    expect(() => buildSpec(body(), { ...d, jobs: [active("reel.edit", { folder: "4-other" })] })).not.toThrow();
  });
  it("refuses a change while the reel is being scheduled on Instagram", () => {
    expect(() => buildSpec(body(), { ...d, jobs: [active("instagram.schedule", { reel: "acme/3-half-loaf" })] })).toThrow(/being scheduled/i);
  });
});
