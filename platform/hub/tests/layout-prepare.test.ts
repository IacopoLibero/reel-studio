import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runPrepare } from "../src/layout/prepare.js";
import { has, put, read } from "./helpers/tree.js";

let tmp: string, program: string, work: string, out: string[];
const run = (env: NodeJS.ProcessEnv = {}): number => runPrepare({ write: (t) => out.push(t) }, { REEL_ROOT: work, PROGRAM_ROOT: program, ...env }, new Date("2026-11-20T12:00:00Z"));

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "layout-prepare-"));
  program = join(tmp, "repo"); work = join(tmp, "studio/workspace"); out = [];
  put(program, "package.json", JSON.stringify({ version: "1.2.3" }));
  put(program, "src/kit/theme.ts", "theme"); put(program, "src/Root.tsx", "root"); put(program, "scripts/voice.mjs", "voice");
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("runPrepare", () => {
  it("fills an empty workspace with the program's files and records the version", () => {
    expect(run()).toBe(0);
    expect(read(work, "src/kit/theme.ts")).toBe("theme");
    expect(JSON.parse(read(work, ".reel-studio/program.json")).version).toBe("1.2.3");
  });

  it("does nothing when the workspace is the program folder itself (the old layout)", () => {
    expect(run({ REEL_ROOT: program })).toBe(0);
    expect(has(program, ".reel-studio")).toBe(false);
    expect(out.join("")).toMatch(/same folder/);
  });

  it("keeps the user's own files and updates the program's on the next run", () => {
    run();
    put(work, "src/r1/R1.tsx", "mine");
    put(program, "src/kit/theme.ts", "theme 2");
    expect(run()).toBe(0);
    expect(read(work, "src/kit/theme.ts")).toBe("theme 2");
    expect(read(work, "src/r1/R1.tsx")).toBe("mine");
  });

  it("says which of the user's edited files were saved aside", () => {
    run();
    put(work, "src/kit/theme.ts", "my edit");
    put(program, "src/kit/theme.ts", "theme 2");
    run();
    expect(out.join("")).toMatch(/saved aside.*src\/kit\/theme\.ts/s);
  });

  it("fails clearly when REEL_ROOT is missing", () => {
    expect(runPrepare({ write: (t) => out.push(t) }, { PROGRAM_ROOT: program })).toBe(2);
    expect(out.join("")).toMatch(/REEL_ROOT/);
  });
});
