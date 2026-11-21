import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { EntryNonces } from "../src/enter.js";

describe("EntryNonces", () => {
  it("accepts a nonce once", () => {
    const n = new EntryNonces(() => 0);
    const a = n.issue();
    expect(n.consume(a)).toBe(true);
    expect(n.consume(a)).toBe(false);
  });
  it("rejects an unknown or empty nonce", () => {
    const n = new EntryNonces(() => 0);
    expect(n.consume("nope")).toBe(false);
    expect(n.consume(undefined)).toBe(false);
  });
  it("rejects an expired nonce", () => {
    let now = 0;
    const n = new EntryNonces(() => now, 30_000);
    const a = n.issue();
    now = 30_001;
    expect(n.consume(a)).toBe(false);
  });
  it("issues different nonces and keeps the table small", () => {
    let now = 0;
    const n = new EntryNonces(() => now, 1000);
    const first = n.issue();
    expect(n.issue()).not.toBe(first);
    now = 5000; n.issue();
    expect(n.size).toBe(1);
  });
});

describe("enter routes", () => {
  const TOKEN = "t0ken";
  let tmp: string, app: FastifyInstance;
  beforeAll(() => { process.env.HUB_SCHEDULER = "off"; process.env.HUB_LOG_LEVEL = "silent"; });
  afterAll(() => { delete process.env.HUB_SCHEDULER; delete process.env.HUB_LOG_LEVEL; });
  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "enter-"));
    mkdirSync(join(tmp, "data")); mkdirSync(join(tmp, "web")); writeFileSync(join(tmp, "web/index.html"), "<html></html>");
    const config: Config = { port: 0, host: "127.0.0.1", dataDir: join(tmp, "data"), root: join(tmp, "ws"), token: TOKEN, webDir: join(tmp, "web"), novncTarget: "http://127.0.0.1:1", claudeBin: "/nonexistent", blogDir: join(tmp, "b"), terminalCmd: null };
    app = (await buildApp(config)).app; await app.ready();
  });
  afterEach(async () => { await app.close(); rmSync(tmp, { recursive: true, force: true }); });

  it("needs the token to ask for a nonce", async () => {
    expect((await app.inject({ method: "POST", url: "/api/enter-nonce" })).statusCode).toBe(401);
  });
  it("signs the window in with a nonce, once, and sends it to the hub", async () => {
    const { nonce } = (await app.inject({ method: "POST", url: "/api/enter-nonce", headers: { authorization: `Bearer ${TOKEN}` } })).json();
    const r = await app.inject({ url: `/api/enter?n=${nonce}`, headers: { host: "127.0.0.1:4000" } });
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toBe("/");
    expect(String(r.headers["set-cookie"])).toMatch(/hub_token=t0ken.*HttpOnly.*SameSite=Strict/i);
    expect((await app.inject({ url: `/api/enter?n=${nonce}`, headers: { host: "127.0.0.1:4000" } })).statusCode).toBe(401);
  });
  it("refuses a request whose Host is not the local machine (DNS rebinding)", async () => {
    const { nonce } = (await app.inject({ method: "POST", url: "/api/enter-nonce", headers: { authorization: `Bearer ${TOKEN}` } })).json();
    expect((await app.inject({ url: `/api/enter?n=${nonce}`, headers: { host: "evil.example" } })).statusCode).toBe(403);
  });
});
