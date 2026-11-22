import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { readBrand } from "../src/brands/registry.js";
import { writeTestBrand } from "./helpers/brand.js";

const TOKEN = "t0ken";
const auth = { authorization: `Bearer ${TOKEN}` };
let tmp: string, root: string, data: string, app: FastifyInstance;

beforeAll(() => { process.env.HUB_SCHEDULER = "off"; process.env.HUB_LOG_LEVEL = "silent"; });
afterAll(() => { delete process.env.HUB_SCHEDULER; delete process.env.HUB_LOG_LEVEL; });

function reelFolder(brand: string, folder: string): void {
  const dir = join(data, "brands", brand, "reels", folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "a.mp4"), "video"); writeFileSync(join(dir, "caption.md"), `Caption of ${brand}\n#x`); writeFileSync(join(dir, "cover.png"), "png");
}

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), "brand-routes-"));
  root = join(tmp, "root"); data = join(tmp, "data"); mkdirSync(data); mkdirSync(join(tmp, "web")); writeFileSync(join(tmp, "web/index.html"), "<html></html>");
  writeTestBrand(root, "acme", { name: "Acme", instagram: { account: "acme_cafe", userId: "111", profileDir: null } }, "## To do\n\n- [ ] Is a paper menu cheaper? · hook: myth · source: needs source\n");
  writeTestBrand(root, "beta", { name: "Beta", character: { enabled: true, id: "pip", name: "Pip" } }, "## To do\n");
  reelFolder("acme", "1-first"); reelFolder("beta", "1-other");
  const config: Config = { port: 0, host: "127.0.0.1", dataDir: data, root, token: TOKEN, webDir: join(tmp, "web"), claudeBin: "/nonexistent", blogDir: join(tmp, "blog"), terminalCmd: null };
  app = (await buildApp(config)).app;
  await app.ready();
});
afterEach(async () => { await app.close(); rmSync(tmp, { recursive: true, force: true }); });

const get = (url: string) => app.inject({ url, headers: auth });
const send = (method: "POST" | "PUT", url: string, payload: unknown) => app.inject({ method, url, headers: auth, payload: payload as object });

describe("the brand list", () => {
  it("lists the brands for the switcher and names the default", async () => {
    const r = (await get("/api/brands")).json();
    expect(r.default).toBe("acme");
    expect(r.brands.map((b: { slug: string }) => b.slug)).toEqual(["acme", "beta"]);
    expect(r.brands[0]).toMatchObject({ name: "Acme", accent: "#2f6fed", instagramAccount: "acme_cafe", hasInstagramUserId: true, character: { enabled: false } });
    expect(r.brands[1].character).toMatchObject({ enabled: true, id: "pip", name: "Pip" });
    expect((await get("/api/brands/beta")).json().name).toBe("Beta");
  });
  it("needs the token and answers a missing brand with a readable 404", async () => {
    expect((await app.inject({ url: "/api/brands/acme/reels" })).statusCode).toBe(401);
    const r = await get("/api/brands/nope/reels");
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual({ error: "That brand does not exist." });
  });
});

describe("routes scoped to a brand", () => {
  it("shows only that brand's reels and keeps the old paths on the first brand", async () => {
    expect((await get("/api/brands/acme/reels")).json().map((r: { key: string }) => r.key)).toEqual(["acme/1-first"]);
    expect((await get("/api/brands/beta/reels")).json().map((r: { key: string }) => r.key)).toEqual(["beta/1-other"]);
    expect((await get("/api/reels")).json().map((r: { key: string }) => r.key)).toEqual(["acme/1-first"]);
  });
  it("never serves another brand's files through a brand's route", async () => {
    expect((await get(`/api/brands/acme/reels/file?key=${encodeURIComponent("acme/1-first")}&kind=cover`)).statusCode).toBe(200);
    expect((await get(`/api/brands/acme/reels/file?key=${encodeURIComponent("beta/1-other")}&kind=cover`)).statusCode).toBe(404);
    expect((await get(`/api/brands/acme/reels/file?key=${encodeURIComponent("acme/../beta/1-other")}&kind=cover`)).statusCode).toBe(404);
  });
  it("lists the questions of the brand only", async () => {
    expect((await get("/api/brands/acme/factory/questions")).json().map((q: { question: string }) => q.question)).toEqual(["Is a paper menu cheaper?"]);
    expect((await get("/api/brands/beta/factory/questions")).json()).toEqual([]);
  });
  it("tags a new job with the brand and lists it only under that brand", async () => {
    const made = await send("POST", "/api/brands/beta/jobs", { type: "analytics.collect" });
    expect(made.statusCode).toBe(201);
    expect(made.json().brand).toBe("beta");
    expect((await get("/api/brands/beta/jobs")).json().map((j: { id: string }) => j.id)).toContain(made.json().id);
    expect((await get("/api/brands/acme/jobs")).json()).toEqual([]);
    expect((await get("/api/jobs")).json().map((j: { id: string }) => j.id)).toContain(made.json().id);
    expect((await get(`/api/jobs/${made.json().id}`)).json().brand).toBe("beta");
  });
  it("the old POST /api/jobs goes to the first brand, or the brand named in the params", async () => {
    expect((await send("POST", "/api/jobs", { type: "analytics.collect" })).json().brand).toBe("acme");
    const r = await send("POST", "/api/jobs", { type: "reel.ideas", params: { count: 3, brand: "beta" } });
    expect(r.json().brand).toBe("beta");
    expect((await send("POST", "/api/jobs", { type: "reel.ideas", params: { count: 3, brand: "nope" } })).statusCode).toBe(404);
  });
  it("refuses a character page for a brand without a character", async () => {
    expect((await get("/api/brands/acme/character")).statusCode).toBe(404);
    expect((await get("/api/brands/beta/character")).json()).toEqual([]);
  });
  it("shows the Instagram account of the brand in the Instagram section of its settings", async () => {
    const a = (await get("/api/brands/acme/instagram")).json();
    expect(a).toMatchObject({ account: "acme_cafe", brand: { slug: "acme", name: "Acme" }, stub: true });
    expect((await get("/api/brands/beta/instagram")).json().account).toBe("");
  });
  it("answers the calendar of each brand on its own", async () => {
    const a = (await get("/api/brands/acme/calendar?weeks=2")).json();
    expect(a).toMatchObject({ stub: true, posts: [] });
    expect((await get("/api/brands/beta/calendar?weeks=2")).statusCode).toBe(200);
  });
});

describe("settings per brand", () => {
  it("saves the brand's part for that brand only and the shared part for all", async () => {
    const cur = (await get("/api/brands/acme/settings")).json();
    expect(cur.accountName).toBe("acme_cafe");
    const put = await send("PUT", "/api/brands/acme/settings", { ...cur, daily: { ...cur.daily, enabled: true, earliest: "08:15" }, blenderDevice: "cpu", accountName: "acme_new" });
    expect(put.statusCode).toBe(200);
    const beta = (await get("/api/brands/beta/settings")).json();
    expect(beta.daily).toMatchObject({ enabled: false, earliest: "06:00" });
    expect(beta.blenderDevice).toBe("cpu");
    expect((await get("/api/settings")).json().daily.earliest).toBe("08:15");
    expect(readBrand(data, "acme")?.instagram.account).toBe("acme_new");
    expect(readBrand(data, "beta")?.instagram.account).toBe("");
    expect(JSON.parse(readFileSync(join(data, "brands/acme/settings.json"), "utf8")).daily.earliest).toBe("08:15");
  });
  it("refuses invalid settings", async () => {
    const cur = (await get("/api/brands/acme/settings")).json();
    expect((await send("PUT", "/api/brands/acme/settings", { ...cur, daily: { ...cur.daily, earliest: "25:00" } })).statusCode).toBe(400);
  });
});

describe("slots, Instagram login and the character files", () => {
  it("offers free slots from the brand's own pattern and marks its taken ones", async () => {
    const a = (await get("/api/brands/acme/slots?count=3")).json();
    expect(a).toHaveLength(3);
    mkdirSync(join(data, "brands/acme"), { recursive: true });
    writeFileSync(join(data, "brands/acme/scheduled.json"), JSON.stringify({ "acme/1-first": { slot: a[0].date + "T" + a[0].time, scheduledAt: "x" } }));
    expect((await get("/api/brands/acme/slots?count=3")).json()[0].taken).toBe(true);
    expect((await get("/api/brands/beta/slots?count=3")).json()[0].taken).toBe(false);
  });
  it("opens the login window of the brand (the stub scheduler says it is not installed)", async () => {
    const r = await send("POST", "/api/brands/beta/instagram/login-window", {});
    expect(r.json()).toMatchObject({ opened: false });
    expect((await app.inject({ method: "POST", url: "/api/brands/nope/instagram/login-window", headers: auth })).statusCode).toBe(404);
  });
  it("serves a character's frames and counts its images, only for the brand that has one", async () => {
    mkdirSync(join(data, "brands/beta/mascot/movements/hop"), { recursive: true });
    writeFileSync(join(data, "brands/beta/mascot/movements/hop/f-0001.png"), "png"); writeFileSync(join(data, "brands/beta/mascot/movements/hop/info.json"), JSON.stringify({ frames: 1 }));
    expect((await get("/api/brands/beta/character/hop/frame/f-0001.png")).statusCode).toBe(200);
    expect((await get("/api/brands/beta/character/hop/frame/f-0009.png")).statusCode).toBe(404);
    expect((await get("/api/brands/acme/character/hop/frame/f-0001.png")).statusCode).toBe(404);
    expect((await get("/api/brands/beta/character/hop")).json()).toEqual({ images: 1 });
    expect((await get("/api/brands/beta/character/Bad Name")).statusCode).toBe(400);
    expect((await get("/api/brands/beta/character")).json()[0]).toMatchObject({ name: "hop", rendered: true, inScript: false });
  });
  it("serves a reel's video and refuses a bad kind", async () => {
    expect((await get(`/api/brands/acme/reels/file?key=${encodeURIComponent("acme/1-first")}&kind=mp4`)).headers["content-type"]).toBe("video/mp4");
    expect((await get(`/api/brands/acme/reels/file?key=${encodeURIComponent("acme/1-first")}&kind=txt`)).statusCode).toBe(404);
  });
});
