import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runChecks, type CheckContext } from "../src/setup/checks.js";
import { readSetup, writeSetup } from "../src/setup/state.js";
import { recommendMode, VOICE_MODES, voiceMode } from "../src/setup/voice-modes.js";

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "setup-")); });
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const ctx = (over: Partial<CheckContext> = {}): CheckContext => ({
  which: () => null, workspace: join(tmp, "workspace"), dataDir: join(tmp, "data"), nodeVersion: "22.4.0", gpu: null, ...over,
});
const byId = (items: ReturnType<typeof runChecks>, id: string) => items.find((i) => i.id === id);

describe("voice modes", () => {
  it("has a unique id per mode and one 'none' mode", () => {
    const ids = VOICE_MODES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("none");
  });
  it("recommends the GPU mode with an NVIDIA card and the light mode without", () => {
    expect(recommendMode("NVIDIA GeForce RTX 5050").id).toBe("gpu-voxcpm2");
    expect(recommendMode(null).id).toBe("cpu-voxcpm2");
  });
  it("finds a mode by id and returns null for an unknown id", () => {
    expect(voiceMode("none")?.id).toBe("none");
    expect(voiceMode("nope")).toBeNull();
  });
});

describe("setup state", () => {
  it("starts empty when nothing was saved", () => {
    expect(readSetup(join(tmp, "data"))).toEqual({ version: 1, completed: false, voiceMode: null });
  });
  it("saves and reads back, and ignores a damaged file", () => {
    const d = join(tmp, "data");
    writeSetup(d, { version: 1, completed: true, voiceMode: "gpu-voxcpm2" });
    expect(readSetup(d)).toEqual({ version: 1, completed: true, voiceMode: "gpu-voxcpm2" });
    writeFileSync(join(d, "setup.json"), "{not json");
    expect(readSetup(d).completed).toBe(false);
  });
  it("drops a voice mode that no longer exists", () => {
    const d = join(tmp, "data"); mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "setup.json"), JSON.stringify({ version: 1, completed: true, voiceMode: "gone" }));
    expect(readSetup(d).voiceMode).toBeNull();
  });
});

describe("checks", () => {
  it("marks a tool found on the PATH as ok and a missing one as missing with a hint", () => {
    const items = runChecks(ctx({ which: (n) => (n === "ffmpeg" ? "/usr/bin/ffmpeg" : null) }));
    expect(byId(items, "ffmpeg")).toMatchObject({ status: "ok", detail: "/usr/bin/ffmpeg" });
    expect(byId(items, "chromium")).toMatchObject({ status: "missing", required: true });
    expect(byId(items, "chromium")?.hint).toMatch(/pacman -S/);
  });
  it("needs build tools and whisper, which the app can install, to make a reel", () => {
    const items = runChecks(ctx());
    expect(byId(items, "build-tools")).toMatchObject({ status: "missing", required: true, auto: false });
    expect(byId(items, "whisper")).toMatchObject({ status: "missing", required: true, auto: true });
    const ok = runChecks(ctx({ which: (n) => (n === "make" || n === "g++" ? `/usr/bin/${n}` : null) }));
    expect(byId(ok, "build-tools")?.status).toBe("ok");
  });
  it("sees whisper once its program and model are both in the workspace", () => {
    const w = join(tmp, "workspace", "whisper.cpp"); mkdirSync(w, { recursive: true });
    writeFileSync(join(w, "main"), "");
    expect(byId(runChecks(ctx()), "whisper")?.status).toBe("missing");
    writeFileSync(join(w, "ggml-medium.bin"), "");
    expect(byId(runChecks(ctx()), "whisper")?.status).toBe("ok");
  });
  it("treats uv as optional: only the voice needs it", () => {
    expect(byId(runChecks(ctx()), "uv")).toMatchObject({ status: "missing", required: false });
  });
  it("accepts Google Chrome in place of Chromium", () => {
    expect(byId(runChecks(ctx({ which: (n) => (n === "google-chrome-stable" ? "/usr/bin/google-chrome-stable" : null) })), "chromium")?.status).toBe("ok");
  });
  it("rejects a Node that is too old", () => {
    expect(byId(runChecks(ctx({ nodeVersion: "20.1.0" })), "node")?.status).toBe("missing");
    expect(byId(runChecks(ctx({ nodeVersion: "22.13.0" })), "node")?.status).toBe("ok");
  });
  it("finds Blender in the app's own tools folder", () => {
    const b = join(tmp, "data", "tools", "blender", "blender");
    mkdirSync(join(b, ".."), { recursive: true }); writeFileSync(b, "");
    expect(byId(runChecks(ctx()), "blender")).toMatchObject({ status: "ok", auto: true });
  });
  it("offers to install what the app can install itself", () => {
    const items = runChecks(ctx());
    expect(byId(items, "blender")).toMatchObject({ status: "missing", auto: true });
    expect(byId(items, "workspace-packages")).toMatchObject({ status: "missing", auto: true });
    expect(byId(items, "voicestudio")).toMatchObject({ status: "missing", auto: true });
    expect(byId(items, "claude")?.auto).toBe(false);
  });
  it("sees the workspace packages and VoiceStudio once installed", () => {
    mkdirSync(join(tmp, "workspace", "node_modules", "remotion"), { recursive: true });
    writeFileSync(join(tmp, "workspace", "node_modules", "remotion", "package.json"), "{}");
    mkdirSync(join(tmp, "data", "tools", "voicestudio", "project"), { recursive: true });
    writeFileSync(join(tmp, "data", "tools", "voicestudio", "project", "pyproject.toml"), "");
    const items = runChecks(ctx());
    expect(byId(items, "workspace-packages")?.status).toBe("ok");
    expect(byId(items, "voicestudio")?.status).toBe("ok");
  });
  it("reports the GPU as information, never as a blocker", () => {
    expect(byId(runChecks(ctx({ gpu: "NVIDIA RTX" })), "gpu")).toMatchObject({ status: "ok", required: false });
    expect(byId(runChecks(ctx()), "gpu")).toMatchObject({ status: "missing", required: false });
  });
});
