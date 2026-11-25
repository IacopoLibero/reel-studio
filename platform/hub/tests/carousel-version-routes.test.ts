import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contentRoutes } from "../src/routes/content.js";
import { HttpError, makeScope } from "../src/routes/scope.js";
import { JobStore } from "../src/jobs/store.js";
import { SettingsStore } from "../src/settings.js";
import type { AppDeps } from "../src/app.js";
import { snapshotCarousel } from "../src/carousels/versions.js";
import { testRegistry } from "./helpers/brand.js";

let tmp: string, app: FastifyInstance, data: string, bdata: string, store: JobStore;
const dir = () => join(bdata, "carousels", "0-price");
beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), "carver-routes-"));
  data = join(tmp, "data"); mkdirSync(data);
  const { reg, ctx } = testRegistry(join(tmp, "root"), data, "acme");
  bdata = ctx.paths.dataDir;
  store = new JobStore(join(data, "jobs.json"));
  const settings = new SettingsStore(join(data, "settings.json"), { brandFile: (s) => reg.paths(s).settingsFile, defaultSlug: () => reg.defaultSlug() });
  const deps = { config: { root: join(tmp, "root"), dataDir: data }, store, settings, runner: { enqueue: () => undefined }, brands: reg } as unknown as AppDeps;
  mkdirSync(dir(), { recursive: true });
  for (const n of [1, 2]) writeFileSync(join(dir(), `slide-${n}.png`), `now-${n}`);
  writeFileSync(join(dir(), "caption.md"), "caption now");
  app = fastify();
  app.setErrorHandler((e: Error & { statusCode?: number }, _r, reply) => reply.code(e instanceof HttpError ? e.statusCode : e.statusCode ?? 500).send({ error: e.message }));
  const scope = makeScope(deps);
  await app.register(async (s) => contentRoutes(s, deps, scope), { prefix: "/api" });
  await app.ready();
});
afterEach(async () => { await app.close(); rmSync(tmp, { recursive: true, force: true }); });

describe("carousel version routes", () => {
  it("lists the versions, serves a version's own file and goes back to it, keeping the current one", async () => {
    const id = snapshotCarousel(dir(), new Date("2026-11-25T10:00:00Z"), "the first one");
    writeFileSync(join(dir(), "slide-1.png"), "changed");
    const list = (await app.inject({ url: "/api/carousels/0-price/versions" })).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, label: "the first one" });
    const old = await app.inject({ url: `/api/carousels/file?folder=0-price&name=slide-1.png&version=${id}` });
    expect(old.body).toBe("now-1");
    expect((await app.inject({ url: "/api/carousels/file?folder=0-price&name=slide-1.png" })).body).toBe("changed");
    const back = await app.inject({ method: "POST", url: `/api/carousels/0-price/versions/${id}/restore` });
    expect(back.statusCode).toBe(200);
    expect(readFileSync(join(dir(), "slide-1.png"), "utf8")).toBe("now-1");
    expect((await app.inject({ url: "/api/carousels/0-price/versions" })).json()).toHaveLength(2);
  });
  it("refuses an unsafe version name, an unknown carousel or version, and a carousel that is busy", async () => {
    const id = snapshotCarousel(dir(), new Date("2026-11-25T10:00:00Z"));
    expect((await app.inject({ url: `/api/carousels/file?folder=0-price&name=slide-1.png&version=..` })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/carousels/file?folder=0-price&name=plan.md&version=${id}` })).statusCode).toBe(404);
    expect((await app.inject({ url: "/api/carousels/9-none/versions" })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/api/carousels/0-price/versions/nope/restore" })).statusCode).toBe(404);
    const j = store.create({ type: "carousel.edit", brand: "acme", title: "t", steps: ["a"], params: { folder: "0-price", slide: 1, message: "x" } });
    store.setStatus(j.id, "running");
    expect((await app.inject({ method: "POST", url: `/api/carousels/0-price/versions/${id}/restore` })).statusCode).toBe(409);
  });
});
