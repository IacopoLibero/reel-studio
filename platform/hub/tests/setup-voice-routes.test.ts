import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupVoiceRoutes, type VoiceApi } from "../src/routes/setup-voice.js";
import { HttpError } from "../src/routes/scope.js";

const plan = { repoId: "x/y", ready: true, blockers: [], planId: "a".repeat(32), planDigest: "b".repeat(64), components: [], documents: [{ id: "d1", title: "T", url: "" }], acknowledgement: "I acknowledge." };
let app: FastifyInstance, calls: string[], up: boolean;
const api: VoiceApi = {
  catalog: async () => { if (!up) throw new Error("VoiceStudio is not running."); return [{ repoId: "x/y", label: "X", role: "TTS", sizeGb: 1, required: false, note: "", installed: false }]; },
  providers: async () => ({ active: "off", providers: [] }),
  installStatus: async () => ({ jobs: [] }),
  prepare: async (r) => { calls.push(`prepare ${r}`); return plan; },
  commit: async (a) => { calls.push(`commit ${a.planId} ${a.documentIds.join(",")}`); return {}; },
  setProvider: async (id, key) => { calls.push(`provider ${id} ${key ?? ""}`); },
};

beforeEach(async () => {
  calls = []; up = true;
  app = fastify();
  app.setErrorHandler((e: Error & { statusCode?: number }, _r, reply) => reply.code(e instanceof HttpError ? e.statusCode : (e.statusCode ?? 500)).send({ error: e.message }));
  setupVoiceRoutes(app, () => api);
  await app.ready();
});
afterEach(async () => { await app.close(); });

const post = (url: string, payload: unknown) => app.inject({ method: "POST", url, payload: payload as object });

describe("voice setup routes", () => {
  it("returns the models, the LLM choices and the install status when VoiceStudio runs", async () => {
    const r = (await app.inject({ url: "/api/setup/voice" })).json();
    expect(r.running).toBe(true);
    expect(r.models[0].repoId).toBe("x/y");
    expect(r.llm.active).toBe("off");
  });
  it("says it is not running instead of failing", async () => {
    up = false;
    const r = await app.inject({ url: "/api/setup/voice" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ running: false, models: [] });
  });
  it("makes the install plan for a model", async () => {
    const r = await post("/api/setup/voice/plan", { repoId: "x/y" });
    expect(r.json().acknowledgement).toBe("I acknowledge.");
    expect(calls).toEqual(["prepare x/y"]);
  });
  it("refuses a repo id that is not owner/name", async () => {
    expect((await post("/api/setup/voice/plan", { repoId: "../etc/passwd" })).statusCode).toBe(400);
    expect(calls).toEqual([]);
  });
  it("downloads only after the person acknowledged the notices", async () => {
    const body = { planId: "a".repeat(32), planDigest: "b".repeat(64), documentIds: ["d1"] };
    expect((await post("/api/setup/voice/install", { ...body, acknowledged: false })).statusCode).toBe(400);
    expect((await post("/api/setup/voice/install", body)).statusCode).toBe(400);
    expect(calls).toEqual([]);
    expect((await post("/api/setup/voice/install", { ...body, acknowledged: true })).statusCode).toBe(200);
    expect(calls).toEqual([`commit ${"a".repeat(32)} d1`]);
  });
  it("refuses a malformed plan id or digest", async () => {
    expect((await post("/api/setup/voice/install", { planId: "x", planDigest: "y", documentIds: [], acknowledged: true })).statusCode).toBe(400);
  });
  it("sets the LLM provider, with an optional key", async () => {
    expect((await app.inject({ method: "PUT", url: "/api/setup/voice/llm", payload: { provider: "openai", apiKey: "sk-1" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "PUT", url: "/api/setup/voice/llm", payload: { provider: "off" } })).statusCode).toBe(200);
    expect(calls).toEqual(["provider openai sk-1", "provider off "]);
  });
  it("refuses an odd provider id", async () => {
    expect((await app.inject({ method: "PUT", url: "/api/setup/voice/llm", payload: { provider: "a/../b" } })).statusCode).toBe(400);
  });
});
