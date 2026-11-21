import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SetupInstaller, type StepFn } from "../src/setup/installer.js";

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "installer-")); });
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const settle = async (i: SetupInstaller, id: string) => { for (let n = 0; n < 200 && i.status(id).state === "running"; n++) await new Promise((r) => setTimeout(r, 5)); };

describe("SetupInstaller", () => {
  it("starts idle", () => {
    expect(new SetupInstaller(tmp, {}).status("blender")).toMatchObject({ state: "idle", lines: [] });
  });
  it("runs a step, keeps its log lines and ends done", async () => {
    const step: StepFn = async (log) => { log("one"); log("two"); };
    const i = new SetupInstaller(tmp, { blender: step });
    i.start("blender");
    await settle(i, "blender");
    expect(i.status("blender")).toMatchObject({ state: "done", lines: ["one", "two"] });
    expect(readFileSync(join(tmp, "setup", "blender.log"), "utf8")).toBe("one\ntwo\n");
  });
  it("ends failed with the error message when the step throws", async () => {
    const i = new SetupInstaller(tmp, { blender: async () => { throw new Error("no network"); } });
    i.start("blender");
    await settle(i, "blender");
    expect(i.status("blender")).toMatchObject({ state: "failed", error: "no network" });
  });
  it("refuses to start a step that is already running, and an unknown step", async () => {
    let release = () => {};
    const i = new SetupInstaller(tmp, { blender: () => new Promise<void>((r) => { release = r; }) });
    expect(i.start("blender")).toBe(true);
    expect(i.start("blender")).toBe(false);
    expect(() => i.start("nope")).toThrow(/unknown/i);
    release();
    await settle(i, "blender");
    expect(i.start("blender")).toBe(true);
    release();
  });
  it("keeps only the last lines in memory", async () => {
    const i = new SetupInstaller(tmp, { blender: async (log) => { for (let n = 0; n < 500; n++) log(`line ${n}`); } });
    i.start("blender");
    await settle(i, "blender");
    const s = i.status("blender");
    expect(s.lines.length).toBeLessThanOrEqual(200);
    expect(s.lines.at(-1)).toBe("line 499");
  });
});
