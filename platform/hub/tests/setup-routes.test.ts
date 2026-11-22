import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { readSetup } from "../src/setup/state.js";
import { findOnPath } from "../src/setup/which.js";

const TOKEN = "t0ken";
const auth = { authorization: `Bearer ${TOKEN}` };
let tmp: string, data: string, app: FastifyInstance;

beforeAll(() => { process.env.HUB_SCHEDULER = "off"; process.env.HUB_LOG_LEVEL = "silent"; });
afterAll(() => { delete process.env.HUB_SCHEDULER; delete process.env.HUB_LOG_LEVEL; });

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), "setup-routes-"));
  data = join(tmp, "data"); mkdirSync(data); mkdirSync(join(tmp, "web")); writeFileSync(join(tmp, "web/index.html"), "<html></html>");
  const config: Config = { port: 0, host: "127.0.0.1", dataDir: data, root: join(tmp, "workspace"), token: TOKEN, webDir: join(tmp, "web"), novncTarget: "http://127.0.0.1:1", claudeBin: "/nonexistent", blogDir: join(tmp, "blog"), terminalCmd: null };
  app = (await buildApp(config)).app;
  await app.ready();
});
afterEach(async () => { await app.close(); rmSync(tmp, { recursive: true, force: true }); });

const get = (url: string) => app.inject({ url, headers: auth });
const send = (method: "POST" | "PUT", url: string, payload?: unknown) => app.inject({ method, url, headers: auth, ...(payload === undefined ? {} : { payload: payload as object }) });

describe("setup routes", () => {
  it("needs the login", async () => {
    expect((await app.inject({ url: "/api/setup" })).statusCode).toBe(401);
  });
  it("answers with the checks, the voice modes, a recommendation and the step states", async () => {
    const r = (await get("/api/setup")).json();
    expect(r.state).toEqual({ version: 1, completed: false, voiceMode: null });
    expect(r.items.map((i: { id: string }) => i.id)).toEqual(expect.arrayContaining(["node", "claude", "blender", "voicestudio", "whisper", "build-tools"]));
    expect(r.modes.map((m: { id: string }) => m.id)).toContain("gpu-voxcpm2");
    expect(r.recommended).toMatch(/voxcpm2/);
    expect(r.steps.blender.state).toBe("idle");
  });
  it("saves the chosen voice mode and refuses an unknown one", async () => {
    expect((await send("PUT", "/api/setup/voice-mode", { id: "light-kittentts" })).statusCode).toBe(200);
    expect(readSetup(data).voiceMode).toBe("light-kittentts");
    expect((await send("PUT", "/api/setup/voice-mode", { id: "nope" })).statusCode).toBe(400);
  });
  it("refuses an unknown install step", async () => {
    expect((await send("POST", "/api/setup/steps/rm-rf")).statusCode).toBe(400);
  });
  it("will not finish the setup while a required item is missing", async () => {
    const r = await send("POST", "/api/setup/complete");
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toMatch(/still needs/i);
    expect(readSetup(data).completed).toBe(false);
  });
});

describe("findOnPath", () => {
  it("finds an executable in the given PATH and ignores a plain file", () => {
    const bin = join(tmp, "bin"); mkdirSync(bin);
    writeFileSync(join(bin, "tool"), "#!/bin/sh\n", { mode: 0o755 });
    writeFileSync(join(bin, "plain"), "x", { mode: 0o644 });
    expect(findOnPath("tool", bin)).toBe(join(bin, "tool"));
    expect(findOnPath("plain", bin)).toBeNull();
    expect(findOnPath("missing", bin)).toBeNull();
  });
});
