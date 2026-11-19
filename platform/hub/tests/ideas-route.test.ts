import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ideasRoutes } from "../src/routes/ideas.js";
import { writeBatch, newBatchId } from "../src/ideas/store.js";
import { buildSpec, createSchema, JobRequestError } from "../src/jobs/create.js";
import { DEFAULT_SETTINGS } from "../src/settings.js";
import type { AppDeps } from "../src/app.js";
import type { Job } from "../src/shared/types.js";
import { makeScope } from "../src/routes/scope.js";
import { testRegistry } from "./helpers/brand.js";
import type { BrandCtx } from "../src/brands/context.js";

let tmp: string, app: FastifyInstance, root: string, data: string, bdata: string, ctx: BrandCtx;
beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), "ideas-route-"));
  root = join(tmp, "root"); data = join(tmp, "data");
  mkdirSync(data);
  const made = testRegistry(root, data, "acme"); ctx = made.ctx; bdata = ctx.paths.dataDir;
  copyFileSync(join(import.meta.dirname, "fixtures/reel-questions.md"), join(root, "brand/acme/reel-questions.md"));
  app = fastify();
  const deps = { config: { root, dataDir: data }, brands: made.reg } as unknown as AppDeps;
  await app.register(async (s) => ideasRoutes(s, deps, makeScope(deps)), { prefix: "/api" });
  await app.ready();
});
afterEach(async () => { await app.close(); rmSync(tmp, { recursive: true, force: true }); });

const seed = () => {
  const id = newBatchId();
  writeBatch(bdata, { id, createdAt: "now", brand: "acme", requested: 1, dropped: [], notes: [], skillsUsed: [], handled: {}, ideas: [{ id: "abcdef012345", question: "Who clears the table first?", hook: "identity", source: "needs source", why: "w w w w", sourceSupports: "none", closing: "B" }] });
  return id;
};

describe("ideas routes", () => {
  it("GET lists pending ideas", async () => {
    seed();
    const r = await app.inject({ method: "GET", url: "/api/factory/ideas" });
    expect(r.json()[0].ideas[0].question).toBe("Who clears the table first?");
  });
  it("POST resolve validates the body", async () => {
    expect((await app.inject({ method: "POST", url: "/api/factory/ideas/resolve", payload: { batch: "../x", accept: [] } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/factory/ideas/resolve", payload: { batch: seed() } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/factory/ideas/resolve", payload: { batch: "2020-01-01T00-00-00-000Z", accept: ["abcdef012345"] } })).statusCode).toBe(404);
  });
  it("POST resolve adds the idea", async () => {
    const r = await app.inject({ method: "POST", url: "/api/factory/ideas/resolve", payload: { batch: seed(), accept: ["abcdef012345"] } });
    expect(r.json().added).toEqual(["Who clears the table first?"]);
  });
});

describe("reel.ideas job request", () => {
  it("defaults to 10 and caps at 30", () => {
    const ok = createSchema.parse({ type: "reel.ideas", params: {} });
    expect(ok).toMatchObject({ params: { count: 10 } });
    expect(createSchema.safeParse({ type: "reel.ideas", params: { count: 31 } }).success).toBe(false);
    expect(createSchema.safeParse({ type: "reel.ideas", params: { count: "3" } }).success).toBe(true);
  });
  it("refuses a brand without a question list and a second run at once", () => {
    const d = { root, brand: ctx, settings: DEFAULT_SETTINGS, jobs: [] as Job[] };
    const bare = { ...ctx, slug: "nope", paths: { ...ctx.paths, slug: "nope" } };
    expect(() => buildSpec({ type: "reel.ideas", params: { count: 3 } }, { ...d, brand: bare })).toThrow(JobRequestError);
    const spec = buildSpec({ type: "reel.ideas", params: { count: 3 } }, d);
    expect(spec.brand).toBe("acme");
    expect(spec.steps).toEqual(["Read context", "Generate", "Check duplicates", "Done"]);
    expect(() => buildSpec({ type: "reel.ideas", params: { count: 3 } }, { ...d, jobs: [{ type: "reel.ideas", brand: "acme", status: "running" } as Job] })).toThrow(/already/);
  });
});
