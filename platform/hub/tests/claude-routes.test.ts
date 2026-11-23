import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { setEnvLayer } from "../src/env.js";
import { setProcessTap } from "../src/jobs/process.js";

const TOKEN = "t0ken", KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";
const auth = { authorization: `Bearer ${TOKEN}` };
const FAKE = join(import.meta.dirname, "fixtures/fake-claude-check.mjs");
let tmp: string, data: string, app: FastifyInstance;
beforeAll(() => { process.env.HUB_SCHEDULER = "off"; process.env.HUB_LOG_LEVEL = "silent"; });
afterAll(() => { delete process.env.HUB_SCHEDULER; delete process.env.HUB_LOG_LEVEL; });
beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), "claude-routes-"));
  data = join(tmp, "data"); mkdirSync(data); mkdirSync(join(tmp, "web")); writeFileSync(join(tmp, "web/index.html"), "<html></html>");
  const config: Config = { port: 0, host: "127.0.0.1", dataDir: data, root: join(tmp, "ws"), token: TOKEN, webDir: join(tmp, "web"), claudeBin: FAKE, blogDir: join(tmp, "b"), terminalCmd: null };
  mkdirSync(config.root, { recursive: true });
  app = (await buildApp(config)).app; await app.ready();
});
afterEach(async () => { setEnvLayer("claude", null); setEnvLayer("codex", null); setProcessTap(null); delete process.env.FAKE_MODE; await app.close(); rmSync(tmp, { recursive: true, force: true }); });
const get = (url: string) => app.inject({ url, headers: auth });
const send = (method: "PUT" | "POST", url: string, payload?: unknown) => app.inject({ method, url, headers: auth, ...(payload === undefined ? {} : { payload: payload as object }) });

describe("GET /api/ai", () => {
  it("needs the login", async () => { expect((await app.inject({ url: "/api/ai" })).statusCode).toBe(401); });
  it("starts with the subscription login, no key and no usage yet", async () => {
    expect((await get("/api/ai")).json()).toEqual({
      claude: { access: { mode: "login", hasKey: false, keyHint: "" }, usage: { limits: null, cost: { today: 0, week: 0, month: 0 } } },
      codex: { access: { mode: "login", hasKey: false, keyHint: "" } },
    });
  });
});

describe("PUT /api/ai/claude/access", () => {
  it("saves a key and switches to it; the key is never sent back", async () => {
    const r = await send("PUT", "/api/ai/claude/access", { mode: "api-key", apiKey: KEY });
    expect(r.statusCode).toBe(200);
    expect(r.json().access).toEqual({ mode: "api-key", hasKey: true, keyHint: "…6789" });
    expect(JSON.stringify((await get("/api/ai")).json())).not.toContain("abcdefghij");
    expect(readFileSync(join(data, "claude-api-key"), "utf8")).toBe(KEY);
  });
  it("refuses a wrong key (400) and the API-key mode without a key (400), changing nothing", async () => {
    expect((await send("PUT", "/api/ai/claude/access", { mode: "api-key", apiKey: "nope" })).statusCode).toBe(400);
    expect((await send("PUT", "/api/ai/claude/access", { mode: "api-key" })).statusCode).toBe(400);
    expect((await get("/api/ai")).json().claude.access.mode).toBe("login");
  });
  it("goes back to the login and can remove the key", async () => {
    await send("PUT", "/api/ai/claude/access", { mode: "api-key", apiKey: KEY });
    expect((await send("PUT", "/api/ai/claude/access", { mode: "login" })).json().access).toMatchObject({ mode: "login", hasKey: true });
    expect((await send("PUT", "/api/ai/claude/access", { mode: "login", removeKey: true })).json().access).toMatchObject({ mode: "login", hasKey: false });
  });
  it("makes the jobs that follow use the key, and the login ones not", async () => {
    await send("PUT", "/api/ai/claude/access", { mode: "api-key", apiKey: KEY });
    const { jobEnv } = await import("../src/env.js");
    const { DEFAULT_SETTINGS } = await import("../src/settings.js");
    expect(jobEnv(DEFAULT_SETTINGS, null, {}).ANTHROPIC_API_KEY).toBe(KEY);
    await send("PUT", "/api/ai/claude/access", { mode: "login" });
    expect(jobEnv(DEFAULT_SETTINGS, null, { ANTHROPIC_API_KEY: "from-shell" }).ANTHROPIC_API_KEY).toBeUndefined();
  });
  it("refuses an unknown mode", async () => { expect((await send("PUT", "/api/ai/claude/access", { mode: "free" })).statusCode).toBe(400); });
});

describe("POST /api/ai/claude/check", () => {
  it("makes a tiny Claude call, fills in the usage, and says it worked", async () => {
    const r = await send("POST", "/api/ai/claude/check");
    expect(r.json()).toMatchObject({ ok: true });
    const u = (await get("/api/ai")).json().claude.usage;
    expect(u.limits.session.utilization).toBeCloseTo(0.4);
    expect(u.limits.week.utilization).toBeCloseTo(0.2);
    expect(u.cost.today).toBeGreaterThan(0);
  });
  it("says what went wrong when Claude refuses (a wrong key, not logged in)", async () => {
    process.env.FAKE_MODE = "auth";
    const r = (await send("POST", "/api/ai/claude/check")).json();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Invalid API key|login/i);
  });
});

describe("Codex access", () => {
  const OAI = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789";
  it("is set apart from Claude's: its own key, mode and environment", async () => {
    const r = await send("PUT", "/api/ai/codex/access", { mode: "api-key", apiKey: OAI });
    expect(r.statusCode).toBe(200);
    expect(r.json().access).toEqual({ mode: "api-key", hasKey: true, keyHint: "…6789" });
    const all = (await get("/api/ai")).json();
    expect(all.codex.access.mode).toBe("api-key");
    expect(all.claude.access.mode).toBe("login");
    const { applyEnvLayer } = await import("../src/env.js");
    expect(applyEnvLayer({}, "codex").OPENAI_API_KEY).toBe(OAI);
    expect(applyEnvLayer({}, "claude").OPENAI_API_KEY).toBeUndefined();
  });
  it("refuses a key that is not an OpenAI key", async () => {
    const r = await send("PUT", "/api/ai/codex/access", { mode: "api-key", apiKey: "nope" });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/OpenAI/);
  });
  it("refuses an unknown tool", async () => {
    expect((await send("PUT", "/api/ai/gemini/access", { mode: "login" })).statusCode).toBe(404);
    expect((await send("POST", "/api/ai/gemini/check")).statusCode).toBe(404);
  });
});
