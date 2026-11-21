import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureToolBin, toolBinDir, withToolPath } from "../src/setup/bin.js";
import { VoiceSupervisor, type SupervisorDeps } from "../src/setup/voice-supervisor.js";

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "native-")); });
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("tool bin folder", () => {
  it("puts the folder first on the PATH", () => {
    expect(withToolPath(tmp, "/usr/bin:/bin").split(":")[0]).toBe(toolBinDir(tmp));
  });
  it("writes no wrappers while Blender is not installed", () => {
    ensureToolBin(tmp);
    expect(existsSync(join(toolBinDir(tmp), "blender"))).toBe(false);
  });
  it("writes executable blender and blender-run wrappers once Blender is there", () => {
    const b = join(tmp, "tools", "blender", "blender"); mkdirSync(join(b, ".."), { recursive: true }); writeFileSync(b, "");
    ensureToolBin(tmp);
    for (const n of ["blender", "blender-run"]) {
      const f = join(toolBinDir(tmp), n);
      expect(statSync(f).mode & 0o111).not.toBe(0);
      expect(readFileSync(f, "utf8")).toContain(b);
    }
    expect(readFileSync(join(toolBinDir(tmp), "blender-run"), "utf8")).toContain("BLENDER_DEVICE");
  });
  it("rewrites the wrappers when the data folder moved", () => {
    const b = join(tmp, "tools", "blender", "blender"); mkdirSync(join(b, ".."), { recursive: true }); writeFileSync(b, "");
    mkdirSync(toolBinDir(tmp), { recursive: true }); writeFileSync(join(toolBinDir(tmp), "blender"), "old"); chmodSync(join(toolBinDir(tmp), "blender"), 0o755);
    ensureToolBin(tmp);
    expect(readFileSync(join(toolBinDir(tmp), "blender"), "utf8")).toContain(b);
  });
});

function sup(over: Partial<SupervisorDeps> = {}) {
  const log: string[] = [];
  let exits: (() => void)[] = [];
  const deps: SupervisorDeps = {
    isUp: async () => false,
    spawn: () => { log.push("spawn"); return { stop: () => log.push("stop"), onExit: (cb) => { exits.push(cb); } }; },
    sleep: async () => { log.push("sleep"); },
    ...over,
  };
  return { s: new VoiceSupervisor(deps, { maxRestarts: 2 }), log, crash: () => { const e = exits; exits = []; e.forEach((f) => f()); } };
}

describe("VoiceSupervisor", () => {
  it("starts the server when nothing answers", async () => {
    const { s, log } = sup();
    await s.start();
    expect(log).toEqual(["spawn"]);
  });
  it("leaves alone a server that is already running (the Docker one, or another copy)", async () => {
    const { s, log } = sup({ isUp: async () => true });
    await s.start();
    expect(log).toEqual([]);
  });
  it("starts it again after it stops by itself, and gives up after maxRestarts", async () => {
    const { s, log, crash } = sup();
    await s.start();
    crash(); await new Promise((r) => setTimeout(r, 5));
    crash(); await new Promise((r) => setTimeout(r, 5));
    crash(); await new Promise((r) => setTimeout(r, 5));
    expect(log.filter((l) => l === "spawn")).toHaveLength(3);
    expect(s.state).toBe("failed");
  });
  it("does not restart after stop() and stops the child", async () => {
    const { s, log, crash } = sup();
    await s.start();
    s.stop(); crash(); await new Promise((r) => setTimeout(r, 5));
    expect(log).toEqual(["spawn", "stop"]);
    expect(s.state).toBe("stopped");
  });
  it("does nothing twice when start() is called again while running", async () => {
    const { s, log } = sup();
    await s.start(); await s.start();
    expect(log).toEqual(["spawn"]);
  });
});
