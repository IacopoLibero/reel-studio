import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installVoiceStudio, parseEngineStatus, uvSyncArgs, voiceHome, type VoiceInstallDeps } from "../src/setup/voice-install.js";
import { voiceMode } from "../src/setup/voice-modes.js";

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "voice-install-")); });
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("uvSyncArgs", () => {
  it("uses the CUDA group for the GPU mode and the CPU group otherwise", () => {
    expect(uvSyncArgs("gpu")).toEqual(["sync", "--frozen", "--no-dev", "--python", "3.11", "--group", "cuda"]);
    expect(uvSyncArgs("cpu")).toEqual(["sync", "--frozen", "--no-dev", "--python", "3.11", "--no-group", "cuda", "--group", "cpu"]);
  });
});

describe("parseEngineStatus", () => {
  it("reads installed, running, failed and waiting", () => {
    expect(parseEngineStatus({ installed: true })).toBe("installed");
    expect(parseEngineStatus({ job: { state: "running", steps: [{ id: "pip", state: "running" }] } })).toBe("running pip");
    expect(parseEngineStatus({ job: { state: "failed" } })).toBe("failed");
    expect(parseEngineStatus({ job: { state: "succeeded" } })).toBe("installed");
    expect(parseEngineStatus(null)).toBe("waiting");
    expect(parseEngineStatus("x")).toBe("waiting");
  });
});

function fakes(over: Partial<VoiceInstallDeps> = {}) {
  const calls: string[] = [];
  const deps: VoiceInstallDeps = {
    run: async (cmd, args) => { calls.push(`${cmd} ${args.join(" ")}`); if (cmd === "git") { mkdirSync(join(args.at(-1)!), { recursive: true }); writeFileSync(join(args.at(-1)!, "pyproject.toml"), ""); } },
    startServer: async () => { calls.push("start"); return { stop: () => calls.push("stop") }; },
    http: async (method, path) => { calls.push(`${method} ${path}`); return path.endsWith("/install/status") ? { installed: true } : {}; },
    downloadWeights: async () => { calls.push("weights"); },
    sleep: async () => {},
    ...over,
  };
  return { deps, calls };
}

describe("installVoiceStudio", () => {
  it("clones, syncs, starts, installs the engine, downloads weights, selects it and stops the server", async () => {
    const { deps, calls } = fakes();
    await installVoiceStudio({ dataDir: tmp }, voiceMode("gpu-voxcpm2")!, () => {}, deps);
    expect(calls[0]).toMatch(/^git clone --depth 1 --branch v[\d.]+ https:\/\/github\.com\/debpalash\/VoiceStudio\.git /);
    expect(calls).toContain("uv sync --frozen --no-dev --python 3.11 --group cuda");
    const order = ["start", "POST /engines/sidecar/voxcpm2/install", "GET /engines/sidecar/voxcpm2/install/status", "weights", "POST /engines/select", "stop"];
    expect(order.map((c) => calls.indexOf(c))).toEqual(order.map((c) => calls.indexOf(c)).sort((a, b) => a - b));
    expect(order.every((c) => calls.includes(c))).toBe(true);
  });
  it("skips the engine install for a light engine and only selects it", async () => {
    const { deps, calls } = fakes();
    await installVoiceStudio({ dataDir: tmp }, voiceMode("light-kittentts")!, () => {}, deps);
    expect(calls.some((c) => c.includes("/install"))).toBe(false);
    expect(calls).not.toContain("weights");
    expect(calls).toContain("POST /engines/select");
  });
  it("fails (and stops the server) when the model weights cannot be downloaded, instead of reporting a finished install", async () => {
    const { deps, calls } = fakes({ downloadWeights: async () => { throw new Error("network down"); } });
    await expect(installVoiceStudio({ dataDir: tmp }, voiceMode("gpu-voxcpm2")!, () => {}, deps)).rejects.toThrow(/network down/);
    expect(calls).toContain("stop");
    expect(calls).not.toContain("POST /engines/select");
  });
  it("does nothing for the 'none' mode", async () => {
    const { deps, calls } = fakes();
    await installVoiceStudio({ dataDir: tmp }, voiceMode("none")!, () => {}, deps);
    expect(calls).toEqual([]);
  });
  it("does not clone again when the project is already there", async () => {
    mkdirSync(join(voiceHome(tmp), "project"), { recursive: true }); writeFileSync(join(voiceHome(tmp), "project", "pyproject.toml"), "");
    const { deps, calls } = fakes();
    await installVoiceStudio({ dataDir: tmp }, voiceMode("cpu-voxcpm2")!, () => {}, deps);
    expect(calls.some((c) => c.startsWith("git"))).toBe(false);
  });
  it("stops the server and fails when the engine install fails", async () => {
    const { deps, calls } = fakes({ http: async (_m, p) => (p.endsWith("/install/status") ? { job: { state: "failed" } } : {}) });
    await expect(installVoiceStudio({ dataDir: tmp }, voiceMode("gpu-voxcpm2")!, () => {}, deps)).rejects.toThrow(/engine install failed/i);
    expect(calls).toContain("stop");
  });
});
