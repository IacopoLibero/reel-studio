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
