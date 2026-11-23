import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCommand, sha256File } from "../src/setup/run.js";

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "steps-")); });
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("runCommand", () => {
  it("streams the lines of stdout and stderr to the log", async () => {
    const lines: string[] = [];
    await runCommand("sh", ["-c", "echo out; echo err 1>&2"], { cwd: tmp }, (l) => lines.push(l));
    expect(lines.sort()).toEqual(["err", "out"]);
  });
  it("rejects with the exit code and the last output when the command fails", async () => {
    await expect(runCommand("sh", ["-c", "echo boom; exit 3"], { cwd: tmp }, () => {})).rejects.toThrow(/exit code 3.*boom/s);
  });
  it("rejects when the program does not exist", async () => {
    await expect(runCommand("no-such-program-xyz", [], { cwd: tmp }, () => {})).rejects.toThrow(/no-such-program-xyz/);
  });
  it("passes extra environment variables", async () => {
    const lines: string[] = [];
    await runCommand("sh", ["-c", "echo $REEL_X"], { cwd: tmp, env: { REEL_X: "yes" } }, (l) => lines.push(l));
    expect(lines).toEqual(["yes"]);
  });
});

describe("sha256File", () => {
  it("hashes a file", async () => {
    const f = join(tmp, "a"); writeFileSync(f, "abc");
    expect(await sha256File(f)).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

import { mkdirSync as mk, existsSync as ex } from "node:fs";
import { clearEmptyMountPoint } from "../src/setup/steps.js";

describe("clearEmptyMountPoint", () => {
  it("removes an empty node_modules folder (a leftover mount point) and reports it", () => {
    mk(join(tmp, "node_modules"));
    expect(clearEmptyMountPoint(join(tmp, "node_modules"))).toBe(true);
    expect(ex(join(tmp, "node_modules"))).toBe(false);
  });
  it("leaves a folder that has files in it", () => {
    mk(join(tmp, "node_modules", "remotion"), { recursive: true });
    expect(clearEmptyMountPoint(join(tmp, "node_modules"))).toBe(false);
    expect(ex(join(tmp, "node_modules", "remotion"))).toBe(true);
  });
  it("does nothing when the folder does not exist", () => {
    expect(clearEmptyMountPoint(join(tmp, "nope"))).toBe(false);
  });
});

import { countRemotionSkills } from "../src/setup/steps.js";
import { writeFileSync as wf } from "node:fs";

describe("countRemotionSkills", () => {
  it("counts the remotion-* folders in .claude/skills", () => {
    mk(join(tmp, ".claude", "skills", "remotion-docs"), { recursive: true });
    mk(join(tmp, ".claude", "skills", "remotion-captions"), { recursive: true });
    mk(join(tmp, ".claude", "skills", "reel"), { recursive: true });
    wf(join(tmp, ".claude", "skills", "remotion-file"), "x");
    expect(countRemotionSkills(tmp)).toBe(2);
  });
  it("is 0 when there is no skills folder", () => {
    expect(countRemotionSkills(tmp)).toBe(0);
  });
});

import { withRetries } from "../src/setup/steps.js";

describe("withRetries", () => {
  it("returns at once when the first try works", async () => {
    let n = 0;
    await withRetries(async () => { n++; }, 3, () => {}, async () => {});
    expect(n).toBe(1);
  });
  it("tries again after a failure, says so in the log, and stops at the first success", async () => {
    let n = 0; const lines: string[] = [];
    await withRetries(async () => { if (++n < 3) throw new Error("socket closed"); }, 3, (l) => lines.push(l), async () => {});
    expect(n).toBe(3);
    expect(lines.filter((l) => /try 2 of 3|try 3 of 3/.test(l))).toHaveLength(2);
    expect(lines.join("\n")).toContain("socket closed");
  });
  it("gives up after the last try with the last error", async () => {
    let n = 0;
    await expect(withRetries(async () => { n++; throw new Error(`fail ${n}`); }, 3, () => {}, async () => {})).rejects.toThrow("fail 3");
    expect(n).toBe(3);
  });
  it("waits longer between tries", async () => {
    const waits: number[] = [];
    await expect(withRetries(async () => { throw new Error("x"); }, 3, () => {}, async (ms) => { waits.push(ms); })).rejects.toThrow();
    expect(waits).toEqual([5000, 10000]);
  });
});
