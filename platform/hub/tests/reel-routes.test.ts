import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { appendMessage, readChat } from "../src/reels/chat.js";
import { snapshotReel } from "../src/reels/versions.js";
import { readFileSync } from "node:fs";
import { writeTestBrand } from "./helpers/brand.js";

const TOKEN = "t0ken";
const auth = { authorization: `Bearer ${TOKEN}` };
let tmp: string, data: string, app: FastifyInstance;
beforeAll(() => { process.env.HUB_SCHEDULER = "off"; process.env.HUB_LOG_LEVEL = "silent"; });
afterAll(() => { delete process.env.HUB_SCHEDULER; delete process.env.HUB_LOG_LEVEL; });

const reelDir = (brand: string, folder: string) => join(data, "brands", brand, "reels", folder);
beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), "reel-routes-"));
  const root = join(tmp, "root"); data = join(tmp, "data");
  mkdirSync(data); mkdirSync(join(tmp, "web")); writeFileSync(join(tmp, "web/index.html"), "<html></html>");
  writeTestBrand(root, "acme", { name: "Acme" }, undefined, data); writeTestBrand(root, "beta", { name: "Beta" }, undefined, data);
  for (const [b, f] of [["acme", "3-half-loaf"], ["beta", "1-other"]] as const) {
    mkdirSync(reelDir(b, f), { recursive: true });
    writeFileSync(join(reelDir(b, f), "a.mp4"), "0123456789"); writeFileSync(join(reelDir(b, f), "caption.md"), `Caption of ${b}`); writeFileSync(join(reelDir(b, f), "cover.png"), "png");
    writeFileSync(join(reelDir(b, f), "script.json"), JSON.stringify({ sentences: ["One.", "Two."] }));
  }
  const config: Config = { port: 0, host: "127.0.0.1", dataDir: data, root, token: TOKEN, webDir: join(tmp, "web"), claudeBin: "/nonexistent", blogDir: join(tmp, "blog"), terminalCmd: null };
  app = (await buildApp(config)).app; await app.ready();
});
afterEach(async () => { await app.close(); rmSync(tmp, { recursive: true, force: true }); });
const get = (url: string, headers: Record<string, string> = {}) => app.inject({ url, headers: { ...auth, ...headers } });

describe("the reel page data", () => {
  it("returns the reel, its files and its conversation", async () => {
    appendMessage(reelDir("acme", "3-half-loaf"), { role: "user", text: "Bigger hook", jobId: "j1" });
    const r = (await get("/api/brands/acme/reels/3-half-loaf")).json();
    expect(r.reel).toMatchObject({ key: "acme/3-half-loaf", n: 3, mp4: "a.mp4", caption: "Caption of acme", script: ["One.", "Two."], hasCover: true });
    expect(r.chat.messages.map((m: { text: string }) => m.text)).toEqual(["Bigger hook"]);
    expect(r.busy).toBe(false);
  });
  it("answers 404 for a reel that is not there, and never shows another brand's reel", async () => {
    expect((await get("/api/brands/acme/reels/9-nope")).statusCode).toBe(404);
    expect((await get("/api/brands/acme/reels/1-other")).statusCode).toBe(404);
    expect((await get("/api/brands/acme/reels/..%2F..%2Fx")).statusCode).toBe(404);
  });
  it("needs the login", async () => {
    expect((await app.inject({ url: "/api/brands/acme/reels/3-half-loaf" })).statusCode).toBe(401);
  });
});

describe("the video", () => {
  const url = "/api/brands/acme/reels/file?key=acme%2F3-half-loaf&kind=mp4";
  it("says it accepts ranges, so the player can seek", async () => {
    const r = await get(url);
    expect(r.statusCode).toBe(200);
    expect(r.headers["accept-ranges"]).toBe("bytes");
    expect(r.headers["content-length"]).toBe("10");
  });
  it("answers a range with 206 and just those bytes", async () => {
    const r = await get(url, { range: "bytes=2-5" });
    expect(r.statusCode).toBe(206);
    expect(r.headers["content-range"]).toBe("bytes 2-5/10");
    expect(r.body).toBe("2345");
  });
  it("supports open-ended and suffix ranges, and refuses one outside the file", async () => {
    expect((await get(url, { range: "bytes=7-" })).body).toBe("789");
    expect((await get(url, { range: "bytes=-3" })).body).toBe("789");
    const bad = await get(url, { range: "bytes=50-60" });
    expect(bad.statusCode).toBe(416);
    expect(bad.headers["content-range"]).toBe("bytes */10");
  });
});

describe("undoing a change", () => {
  const post = (url: string, payload: unknown) => app.inject({ method: "POST", url, headers: auth, payload: payload as object });
  const dir = () => reelDir("acme", "3-half-loaf");

  it("lists the saved versions on the reel page, newest first", async () => {
    const a = snapshotReel(dir(), new Date("2026-11-22T10:00:00Z")); const b = snapshotReel(dir(), new Date("2026-11-22T11:00:00Z"));
    const r = (await get("/api/brands/acme/reels/3-half-loaf")).json();
    expect(r.versions.map((v: { name: string }) => v.name)).toEqual([b, a]);
    expect(r.versions[0]).toMatchObject({ at: "2026-11-22T11:00:00.000Z", hasVideo: true });
  });
  it("restores a version, says so in the chat, and keeps the undo undoable", async () => {
    const old = snapshotReel(dir(), new Date("2026-11-22T10:00:00Z"));
    writeFileSync(join(dir(), "a.mp4"), "changed");
    const r = await post("/api/brands/acme/reels/3-half-loaf/restore", { version: old });
    expect(r.statusCode).toBe(200);
    expect(readFileSync(join(dir(), "a.mp4"), "utf8")).toBe("0123456789");
    expect(readChat(dir()).messages.at(-1)).toMatchObject({ role: "claude" });
    expect(readChat(dir()).messages.at(-1)?.text).toMatch(/restored/i);
    expect((await get("/api/brands/acme/reels/3-half-loaf")).json().versions.length).toBeGreaterThan(1);
  });
  it("refuses an unknown or unsafe version, and a version name that is not a version", async () => {
    expect((await post("/api/brands/acme/reels/3-half-loaf/restore", { version: "2020-01-01T00-00-00-000Z" })).statusCode).toBe(404);
    expect((await post("/api/brands/acme/reels/3-half-loaf/restore", { version: "../../x" })).statusCode).toBe(400);
    expect((await post("/api/brands/acme/reels/3-half-loaf/restore", {})).statusCode).toBe(400);
  });
  it("never restores in another brand's reel", async () => {
    expect((await post("/api/brands/acme/reels/1-other/restore", { version: "2026-11-22T10-00-00-000Z" })).statusCode).toBe(404);
  });
});
