import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NotificationStore } from "../src/daily/notifications.js";
import { newPlan, writePlan, transition } from "../src/daily/plan.js";
import { dailyRoutes, makeDailyDeps } from "../src/routes/daily.js";
import { brandRoutes } from "../src/routes/brands.js";
import { HttpError, makeScope } from "../src/routes/scope.js";
import { JobStore } from "../src/jobs/store.js";
import { SettingsStore } from "../src/settings.js";
import type { AppDeps } from "../src/app.js";
import type { DailyDeps } from "../src/daily/deps.js";
import { testRegistry, writeTestBrand } from "./helpers/brand.js";

let tmp: string, app: FastifyInstance, data: string, bdata: string, dd: DailyDeps, deps: AppDeps;
const NOW = new Date("2026-11-20T09:00:00Z");
beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), "daily-routes-"));
  data = join(tmp, "data"); mkdirSync(data);
  const { reg, ctx } = testRegistry(join(tmp, "root"), data, "acme");
  bdata = ctx.paths.dataDir;
  const store = new JobStore(join(data, "jobs.json"));
  const settings = new SettingsStore(join(data, "settings.json"), { brandFile: (s) => reg.paths(s).settingsFile, defaultSlug: () => reg.defaultSlug() });
  const config = { root: join(tmp, "root"), dataDir: data } as AppDeps["config"];
  deps = { config, store, settings, runner: { enqueue: () => undefined } as unknown as AppDeps["runner"], brands: reg };
  dd = { ...makeDailyDeps(deps, ctx), now: () => NOW };
  app = fastify();
  app.setErrorHandler((e: Error & { statusCode?: number }, _r, reply) => reply.code(e instanceof HttpError ? e.statusCode : e.statusCode ?? 500).send({ error: e.message }));
  brandRoutes(app, deps);
  const scope = makeScope(deps);
  for (const prefix of ["/api/brands/:slug", "/api"]) await app.register(async (s) => dailyRoutes(s, deps, scope, () => dd), { prefix });
  await app.ready();
});
afterEach(async () => { await app.close(); rmSync(tmp, { recursive: true, force: true }); });

describe("notifications API", () => {
  it("lists unseen, marks seen, 404 for unknown", async () => {
    const t = (await app.inject({ method: "POST", url: "/api/notifications/test" })).json();
    expect(t).toMatchObject({ kind: "test", seen: false });
    expect(t.title).toMatch(/^TEST/);
    expect((await app.inject({ url: "/api/notifications?unseen=1" })).json()).toHaveLength(1);
    expect((await app.inject({ method: "POST", url: `/api/notifications/${t.id}/seen` })).json().seen).toBe(true);
    expect((await app.inject({ url: "/api/notifications?unseen=1" })).json()).toHaveLength(0);
    expect((await app.inject({ url: "/api/notifications" })).json()).toHaveLength(1);
    expect((await app.inject({ method: "POST", url: "/api/notifications/nope/seen" })).statusCode).toBe(404);
  });
});

describe("brand scoping", () => {
  it("answers on /api/brands/:slug and on the old path for the first brand", async () => {
    expect((await app.inject({ url: "/api/brands/acme/daily" })).json()).toMatchObject({ today: "2026-11-20", plan: null });
    expect((await app.inject({ url: "/api/daily" })).statusCode).toBe(200);
  });
  it("404 for an unknown brand and 409 on a machine without brands", async () => {
    const r = await app.inject({ url: "/api/brands/nope/daily" });
    expect(r.statusCode).toBe(404);
    expect(r.json().error).toMatch(/does not exist/);
    rmSync(join(tmp, "data", "brands"), { recursive: true });
    expect((await app.inject({ url: "/api/daily" })).statusCode).toBe(409);
  });
  it("keeps the notifications of every brand in one list, each naming its brand", async () => {
    writeTestBrand(join(tmp, "root"), "beta", { name: "Beta" });
    mkdirSync(deps.brands.paths("beta").dataDir, { recursive: true });
    NotificationStore.at(bdata).add({ kind: "daily", brand: "acme", title: "A", body: "" });
    NotificationStore.at(deps.brands.paths("beta").dataDir).add({ kind: "daily", brand: "beta", title: "B", body: "" });
    const all = (await app.inject({ url: "/api/notifications?unseen=1" })).json() as { id: string; brand: string }[];
    expect(all.map((n) => n.brand).sort()).toEqual(["acme", "beta"]);
    expect((await app.inject({ method: "POST", url: `/api/notifications/${all[0]?.id}/seen` })).json().seen).toBe(true);
    expect((await app.inject({ url: "/api/notifications?unseen=1" })).json()).toHaveLength(1);
  });
  it("plans of one brand are not visible in another", async () => {
    writeTestBrand(join(tmp, "root"), "beta", { name: "Beta" });
    let p = newPlan("2026-11-20", NOW);
    for (const s of ["analysing", "ideas", "awaiting_approval"] as const) p = transition(p, s);
    writePlan(bdata, p);
    expect((await app.inject({ url: "/api/brands/acme/daily" })).json().plan.status).toBe("awaiting_approval");
    deps.brands.paths("beta");
  });
});

describe("daily API", () => {
  it("shows an empty day and validates input", async () => {
    const v = (await app.inject({ url: "/api/daily" })).json();
    expect(v).toMatchObject({ today: "2026-11-20", plan: null, reels: [], settings: { enabled: false, earliest: "06:00", ideas: 3 } });
    expect((await app.inject({ url: "/api/daily?date=nope" })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/daily/approve", payload: { date: "2026-11-20", picks: [] } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/daily/approve", payload: { date: "2026-11-20", picks: [{ ideaId: "0".repeat(12), closing: "A" }] } })).statusCode).toBe(404);
  });
  it("manual run starts one plan and a second is refused with 409", async () => {
    const a = await app.inject({ method: "POST", url: "/api/daily/run" });
    expect(a.statusCode).toBe(201);
    expect(a.json().plan.status).toBe("collecting");
    expect(dd.store.list().filter((j) => j.type === "daily.run")).toHaveLength(1);
    expect((await app.inject({ method: "POST", url: "/api/daily/run" })).statusCode).toBe(409);
  });
  it("skip works from awaiting_approval and is refused after", async () => {
    let p = newPlan("2026-11-20", NOW);
    for (const s of ["analysing", "ideas", "awaiting_approval"] as const) p = transition(p, s);
    writePlan(bdata, p);
    expect((await app.inject({ method: "POST", url: "/api/daily/skip", payload: { date: "2026-11-20" } })).json().plan.status).toBe("skipped");
    expect((await app.inject({ method: "POST", url: "/api/daily/skip", payload: { date: "2026-11-20" } })).statusCode).toBe(409);
  });
  it("confirm and reject refuse reels that are not in review", async () => {
    expect((await app.inject({ method: "POST", url: "/api/daily/confirm", payload: { date: "2026-11-20", idea: "a".repeat(12), slotDate: "2026-11-24", slotTime: "17:30" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/api/daily/reject", payload: { date: "2026-11-20", idea: "a".repeat(12), note: "make it slower" } })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/daily/slots?date=2026-11-20&idea=${"a".repeat(12)}` })).statusCode).toBe(404);
  });
});
