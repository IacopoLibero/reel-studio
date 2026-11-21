import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startDailyLoops } from "../src/daily/loops.js";
import { startDaily, startRun } from "../src/daily/service.js";
import { readPlan } from "../src/daily/plan.js";
import { NotificationStore } from "../src/daily/notifications.js";
import { JobStore } from "../src/jobs/store.js";
import { DEFAULT_SETTINGS, SettingsStore } from "../src/settings.js";
import type { DailyDeps } from "../src/daily/deps.js";
import type { BrandRegistry } from "../src/brands/registry.js";
import { testRegistry, writeTestBrand } from "./helpers/brand.js";

const NOW = new Date("2026-11-20T09:00:00Z");
const ONLINE = (async () => new Response(null)) as typeof fetch;
let tmp: string, data: string, reg: BrandRegistry, store: JobStore, settings: SettingsStore, enqueued: string[];

const make = (b: DailyDeps["brand"]): DailyDeps => ({
  config: { root: reg.root, dataDir: b.paths.dataDir } as DailyDeps["config"], brand: b, store, settings: settings.forBrand(b.slug),
  runner: { enqueue: (j: { id: string }) => enqueued.push(j.id) } as unknown as DailyDeps["runner"], notes: NotificationStore.at(b.paths.dataDir), now: () => NOW,
});
const start = (d: DailyDeps) => startDaily(d, ONLINE);

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "loops-")); data = join(tmp, "data"); mkdirSync(data); enqueued = [];
  reg = testRegistry(join(tmp, "root"), data, "acme").reg;
  writeTestBrand(join(tmp, "root"), "beta", { name: "Beta" });
  for (const s of ["acme", "beta"]) mkdirSync(reg.paths(s).dataDir, { recursive: true });
  store = new JobStore(join(data, "jobs.json"));
  settings = new SettingsStore(join(data, "settings.json"), { brandFile: (s) => reg.paths(s).settingsFile, defaultSlug: () => reg.defaultSlug() });
});
afterEach(() => { store.flush(); rmSync(tmp, { recursive: true, force: true }); });

describe("the daily loop runs per brand", () => {
  it("starts one loop for every brand and picks up a brand made later", () => {
    const loops = startDailyLoops(reg, make, start, 60_000);
    expect(loops.slugs().sort()).toEqual(["acme", "beta"]);
    writeTestBrand(join(tmp, "root"), "gamma", { name: "Gamma" });
    expect(loops.ensure("gamma")).toBe(true);
    expect(loops.ensure("gamma")).toBe(false);
    expect(loops.ensure("nope")).toBe(false);
    expect(loops.tick("nope")).toBeNull();
    loops.stop();
    expect(loops.slugs()).toEqual([]);
  });
  it("each brand has its own switch: only the brand with the loop on starts a run", async () => {
    settings.set({ ...settings.get("acme"), daily: { enabled: true, earliest: "06:00", ideas: 3, threads: false } }, "acme");
    const loops = startDailyLoops(reg, make, start, 60_000);
    expect(await loops.tick("acme")).toMatchObject({ run: true });
    expect(await loops.tick("beta")).toMatchObject({ run: false, reason: "off" });
    expect(readPlan(reg.paths("acme").dataDir, "2026-11-20")).not.toBeNull();
    expect(readPlan(reg.paths("beta").dataDir, "2026-11-20")).toBeNull();
    const jobs = store.list().filter((j) => j.type === "daily.run");
    expect(jobs.map((j) => j.brand)).toEqual(["acme"]);
    expect(enqueued).toHaveLength(1);
    loops.stop();
  });
  it("each brand has its own earliest time and its own plan for the day", async () => {
    settings.set({ ...settings.get("acme"), daily: { enabled: true, earliest: "06:00", ideas: 3, threads: false } }, "acme");
    settings.set({ ...settings.get("beta"), daily: { enabled: true, earliest: "23:00", ideas: 3, threads: false } }, "beta");
    const loops = startDailyLoops(reg, make, start, 60_000);
    expect(await loops.tick("beta")).toMatchObject({ run: false, reason: "too early" });
    expect(await loops.tick("acme")).toMatchObject({ run: true });
    expect(await loops.tick("acme")).toMatchObject({ run: false, reason: "already ran today" });
    loops.stop();
  });
  it("a brand's run does not block another brand's plan, and the heavy-job gate is shared", async () => {
    for (const s of ["acme", "beta"]) settings.set({ ...settings.get(s), daily: { enabled: true, earliest: "06:00", ideas: 3, threads: false } }, s);
    store.create({ type: "reel.make", brand: "beta", title: "busy" });
    const loops = startDailyLoops(reg, make, start, 60_000);
    // a queued heavy job of ANY brand holds every loop back
    expect(await loops.tick("acme")).toMatchObject({ run: false, reason: "another heavy job is running" });
    loops.stop();
    const jobs = store.list().filter((j) => j.type === "reel.make");
    for (const j of jobs) store.setStatus(j.id, "cancelled");
    const again = startDailyLoops(reg, make, start, 60_000);
    expect(await again.tick("acme")).toMatchObject({ run: true });
    expect(startRun(make(reg.paths("beta") && { slug: "beta", brand: reg.get("beta")!, paths: reg.paths("beta") }), "2026-11-21").status).toBe("collecting");
    again.stop();
  });
  it("drops the loop of a brand that was removed", () => {
    const loops = startDailyLoops(reg, make, start, 5);
    rmSync(join(tmp, "data/brands/beta"), { recursive: true });
    return new Promise<void>((resolve) => setTimeout(() => { expect(loops.slugs()).toEqual(["acme"]); loops.stop(); resolve(); }, 40));
  });
  it("the defaults leave the loop off", () => { expect(DEFAULT_SETTINGS.daily.enabled).toBe(false); });
});
