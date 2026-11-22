import { describe, expect, it } from "vitest";
import { VoiceClient, summarizePlan, summarizeCatalog } from "../src/setup/voice-catalog.js";

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const fake = (routes: Record<string, unknown | ((init?: { body?: string }) => unknown)>) => {
  const calls: string[] = [];
  const f = async (url: string, init?: { method?: string; body?: string }) => {
    const key = `${init?.method ?? "GET"} ${url.replace("http://v", "")}`;
    calls.push(init?.body ? `${key} ${init.body}` : key);
    if (!(key in routes)) return json(404, {});
    const r = routes[key];
    return json(200, typeof r === "function" ? r(init) : r);
  };
  return { f, calls };
};

describe("summarizeCatalog", () => {
  it("keeps what the screen needs and marks what is installed", () => {
    const rows = summarizeCatalog({ models: [
      { repo_id: "a/b", label: "A", role: "TTS", size_gb: 2.4, required: true, note: null, installed: false, extra: 1 },
      { repo_id: "c/d", label: "C", role: "TTS", size_gb: 0.1, required: false, note: "n", installed: true },
    ] });
    expect(rows).toEqual([
      { repoId: "a/b", label: "A", role: "TTS", sizeGb: 2.4, required: true, note: "", installed: false },
      { repoId: "c/d", label: "C", role: "TTS", sizeGb: 0.1, required: false, note: "n", installed: true },
    ]);
  });
  it("leaves out transcription (ASR) and other non-voice models", () => {
    const rows = summarizeCatalog({ models: [{ repo_id: "w/x", label: "W", role: "ASR" }, { repo_id: "v/y", label: "V", role: "TTS" }] });
    expect(rows.map((r) => r.repoId)).toEqual(["v/y"]);
  });
  it("tolerates a missing or odd answer", () => {
    expect(summarizeCatalog(null)).toEqual([]);
    expect(summarizeCatalog({ models: "x" })).toEqual([]);
  });
});

describe("summarizePlan", () => {
  const plan = { repo_id: "x/y", readiness: "ready", blockers: [], plan_id: "a".repeat(32), plan_digest: "b".repeat(64),
    components: [{ id: "x/y", revision: "r1", license: "mit", evidence_url: "http://e" }],
    documents: [{ id: "doc1", title: "Terms", url: "http://t" }], acknowledgement: { text: "I acknowledge." } };
  it("shows the model, its licences, the notices, the acknowledgement text and whether it can be installed", () => {
    expect(summarizePlan(plan)).toMatchObject({ repoId: "x/y", ready: true, blockers: [], planId: "a".repeat(32), planDigest: "b".repeat(64),
      components: [{ id: "x/y", license: "mit" }], documents: [{ id: "doc1", title: "Terms" }], acknowledgement: "I acknowledge." });
  });
  it("is not ready when VoiceStudio blocks the plan, and says why", () => {
    const r = summarizePlan({ ...plan, readiness: "blocked", blockers: ["terms_unverified"] });
    expect(r.ready).toBe(false); expect(r.blockers).toEqual(["terms_unverified"]);
  });
});

describe("VoiceClient", () => {
  it("reads the catalog and the install status", async () => {
    const { f } = fake({ "GET /setup/recommendations": { models: [] }, "GET /models/install/status": { jobs: [] } });
    const c = new VoiceClient("http://v", f);
    expect(await c.catalog()).toEqual([]);
    expect(await c.installStatus()).toEqual({ jobs: [] });
  });
  it("asks for an install plan for a repo", async () => {
    const { f, calls } = fake({ "POST /models/install/prepare": { repo_id: "x/y", readiness: "ready", blockers: [], plan_id: "a".repeat(32), plan_digest: "b".repeat(64), components: [], documents: [], acknowledgement: { text: "t" } } });
    const plan = await new VoiceClient("http://v", f).prepare("x/y");
    expect(plan.ready).toBe(true);
    expect(calls[0]).toContain('"repo_id":"x/y"');
  });
  it("downloads a model with VoiceStudio's install call", async () => {
    const { f, calls } = fake({ "POST /models/install": { status: "started" } });
    await new VoiceClient("http://v", f).install("x/y");
    expect(calls[0]).toBe('POST /models/install {"repo_id":"x/y"}');
  });
  it("says clearly when VoiceStudio is not running", async () => {
    const c = new VoiceClient("http://v", async () => { throw new Error("ECONNREFUSED"); });
    await expect(c.catalog()).rejects.toThrow(/VoiceStudio is not running/);
  });
  it("turns an error answer into a message", async () => {
    const c = new VoiceClient("http://v", async () => json(500, { detail: "boom" }));
    await expect(c.catalog()).rejects.toThrow(/boom|500/);
  });

  it("reads the engines, selects one, removes a model and cancels a download", async () => {
    const { f, calls } = fake({
      "GET /engines/tts": { active: "voxcpm2", backends: [{ id: "voxcpm2", available: true }] },
      "POST /engines/select": {}, "DELETE /models/openbmb/VoxCPM2": {}, "POST /models/install/cancel": {},
    });
    const c = new VoiceClient("http://v", f);
    expect((await c.engines()).active).toBe("voxcpm2");
    await c.selectEngine("kittentts");
    await c.remove("openbmb/VoxCPM2");
    await c.cancel("lj1995/GPT-SoVITS");
    expect(calls[1]).toBe('POST /engines/select {"family":"tts","backend_id":"kittentts"}');
    expect(calls[2]).toBe("DELETE /models/openbmb/VoxCPM2");
    expect(calls[3]).toBe('POST /models/install/cancel {"repo_id":"lj1995/GPT-SoVITS"}');
  });
});
