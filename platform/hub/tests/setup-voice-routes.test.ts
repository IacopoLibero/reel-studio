import fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupVoiceRoutes, type VoiceApi } from "../src/routes/setup-voice.js";
import { HttpError } from "../src/routes/scope.js";

const plan = { repoId: "x/y", ready: true, blockers: [], planId: "a".repeat(32), planDigest: "b".repeat(64), components: [], documents: [{ id: "d1", title: "T", url: "" }], acknowledgement: "I acknowledge." };
let app: FastifyInstance, calls: string[], up: boolean;
const api: VoiceApi = {
  catalog: async () => { if (!up) throw new Error("VoiceStudio is not running."); return [{ repoId: "x/y", label: "X", role: "TTS", sizeGb: 1, required: false, note: "", installed: false }]; },
  installStatus: async () => ({ jobs: [] }),
  prepare: async (r) => { calls.push(`prepare ${r}`); return plan; },
  engines: async () => ({ active: "voxcpm2", engines: [{ id: "voxcpm2", available: true, reason: "" }, { id: "kittentts", available: true, reason: "" }, { id: "gpt-sovits", available: false, reason: "not ready" }] }),
  selectEngine: async (id) => { calls.push(`select ${id}`); },
  remove: async (r) => { calls.push(`remove ${r}`); },
  cancel: async (r) => { calls.push(`cancel ${r}`); },
  install: async (r) => { calls.push(`install ${r}`); return {}; },
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
  it("returns the voice models and the install status when VoiceStudio runs", async () => {
    const r = (await app.inject({ url: "/api/setup/voice" })).json();
    expect(r.running).toBe(true);
    expect(r.models[0].repoId).toBe("x/y");
    expect(r.active).toBe("voxcpm2");
    expect(r.engines.map((e: { id: string }) => e.id)).toContain("kittentts");
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
  it("downloads only after the person acknowledged the licence", async () => {
    expect((await post("/api/setup/voice/install", { repoId: "x/y", acknowledged: false })).statusCode).toBe(400);
    expect((await post("/api/setup/voice/install", { repoId: "x/y" })).statusCode).toBe(400);
    expect(calls).toEqual([]);
    expect((await post("/api/setup/voice/install", { repoId: "x/y", acknowledged: true })).statusCode).toBe(200);
    expect(calls).toEqual(["install x/y"]);
  });
  it("refuses a bad repo id when installing", async () => {
    expect((await post("/api/setup/voice/install", { repoId: "../x", acknowledged: true })).statusCode).toBe(400);
  });

  it("selects the voice to use, only an engine VoiceStudio can use now", async () => {
    expect((await post("/api/setup/voice/select", { engine: "kittentts" })).statusCode).toBe(200);
    const refused = await post("/api/setup/voice/select", { engine: "gpt-sovits" });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toContain("not ready. Its model may need");
    expect((await post("/api/setup/voice/select", { engine: "../x" })).statusCode).toBe(400);
    expect(calls).toEqual(["select kittentts"]);
  });
  it("removes a downloaded model", async () => {
    expect((await post("/api/setup/voice/remove", { repoId: "KittenML/kitten-tts-mini-0.8" })).statusCode).toBe(200);
    expect(calls).toEqual(["remove KittenML/kitten-tts-mini-0.8"]);
  });
  it("will not remove the model of the voice in use", async () => {
    const r = await post("/api/setup/voice/remove", { repoId: "openbmb/VoxCPM2" });
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toMatch(/in use|another voice/i);
    expect(calls).toEqual([]);
  });
  it("cancels a download", async () => {
    expect((await post("/api/setup/voice/cancel", { repoId: "lj1995/GPT-SoVITS" })).statusCode).toBe(200);
    expect(calls).toEqual(["cancel lj1995/GPT-SoVITS"]);
  });
});
