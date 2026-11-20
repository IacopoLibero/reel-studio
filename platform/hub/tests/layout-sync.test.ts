import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncProgram } from "../src/layout/sync.js";
import { files, has, isExecutable, put, read } from "./helpers/tree.js";

let tmp: string, program: string, work: string;
const ENTRIES = ["src/kit", "src/Root.tsx", "scripts", "brand/_template"];
const run = (extra: object = {}) => syncProgram({ programRoot: program, workspace: work, entries: ENTRIES, version: "1", now: new Date("2026-11-20T10:00:00Z"), ...extra });

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "layout-sync-"));
  program = join(tmp, "program");
  work = join(tmp, "workspace");
  put(program, "src/kit/theme.ts", "theme v1");
  put(program, "src/kit/Captions.tsx", "captions v1");
  put(program, "src/Root.tsx", "root v1");
  put(program, "scripts/voice.mjs", "voice v1");
  put(program, "scripts/run.sh", "#!/bin/sh\n", 0o755);
  put(program, "brand/_template/brand.json", "{}");
  put(program, "platform/hub/secret.ts", "not a program file for the workspace");
  put(program, "src/r1/R1.tsx", "a reel of the author, not in the manifest");
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("syncProgram", () => {
  it("copies only the manifest entries into the workspace", () => {
    const r = run();
    expect(files(work).filter((f) => !f.startsWith(".reel-studio"))).toEqual([
      "brand/_template/brand.json", "scripts/run.sh", "scripts/voice.mjs", "src/Root.tsx", "src/kit/Captions.tsx", "src/kit/theme.ts",
    ]);
    expect(r.copied).toHaveLength(6);
    expect(has(work, "platform")).toBe(false);
    expect(has(work, "src/r1")).toBe(false);
  });

  it("keeps the executable bit", () => {
    run();
    expect(isExecutable(work, "scripts/run.sh")).toBe(true);
    expect(isExecutable(work, "scripts/voice.mjs")).toBe(false);
  });

  it("a second run changes nothing", () => {
    run();
    const r = run();
    expect(r.copied).toEqual([]);
    expect(r.unchanged).toHaveLength(6);
  });

  it("never touches the user's own files in the workspace", () => {
    put(work, "src/r1/R1.tsx", "mine");
    put(work, "reels/acme/1-x/a.mp4", "video");
    put(work, "src/Root.private.tsx", "private root");
    run();
    run();
    expect(read(work, "src/r1/R1.tsx")).toBe("mine");
    expect(read(work, "reels/acme/1-x/a.mp4")).toBe("video");
    expect(read(work, "src/Root.private.tsx")).toBe("private root");
  });

  it("updates a program file that changed upstream", () => {
    run();
    writeFileSync(join(program, "src/kit/theme.ts"), "theme v2");
    const r = run({ version: "2" });
    expect(read(work, "src/kit/theme.ts")).toBe("theme v2");
    expect(r.copied).toEqual(["src/kit/theme.ts"]);
    expect(r.preserved).toEqual([]);
  });

  it("saves a copy of a program file the user edited before replacing it", () => {
    run();
    writeFileSync(join(work, "src/kit/theme.ts"), "my edit");
    writeFileSync(join(program, "src/kit/theme.ts"), "theme v2");
    const r = run({ version: "2" });
    expect(read(work, "src/kit/theme.ts")).toBe("theme v2");
    expect(r.preserved).toEqual(["src/kit/theme.ts"]);
    expect(read(work, ".reel-studio/overwritten/2026-11-20T10-00-00.000Z/src/kit/theme.ts")).toBe("my edit");
  });

  it("saves a copy of a same-named file that existed before the first sync and differs", () => {
    put(work, "src/Root.tsx", "someone else's root");
    const r = run();
    expect(r.preserved).toEqual(["src/Root.tsx"]);
    expect(read(work, "src/Root.tsx")).toBe("root v1");
  });

  it("removes a file the program no longer ships, if the user did not touch it", () => {
    run();
    rmSync(join(program, "src/kit/Captions.tsx"));
    const r = run({ version: "2" });
    expect(r.removed).toEqual(["src/kit/Captions.tsx"]);
    expect(has(work, "src/kit/Captions.tsx")).toBe(false);
  });

  it("keeps a removed program file the user had edited", () => {
    run();
    writeFileSync(join(work, "src/kit/Captions.tsx"), "my edit");
    rmSync(join(program, "src/kit/Captions.tsx"));
    const r = run({ version: "2" });
    expect(r.removed).toEqual([]);
    expect(r.preserved).toEqual(["src/kit/Captions.tsx"]);
    expect(read(work, "src/kit/Captions.tsx")).toBe("my edit");
  });

  it("changes nothing on a dry run", () => {
    const r = run({ dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(r.copied).toHaveLength(6);
    expect(files(work)).toEqual([]);
  });

  it("reports an entry the program does not have", () => {
    const r = run({ entries: [...ENTRIES, "src/cover"] });
    expect(r.missing).toEqual(["src/cover"]);
  });

  it("refuses an entry that leaves the project", () => {
    expect(() => run({ entries: ["../outside"] })).toThrow(/outside/);
    expect(() => run({ entries: ["/etc"] })).toThrow(/outside/);
  });

  it("never writes through a link: a linked folder in the workspace is left alone", () => {
    const outside = join(tmp, "elsewhere");
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "voice.mjs"), "someone else's file");
    mkdirSync(work, { recursive: true });
    symlinkSync(outside, join(work, "scripts"));
    const r = run();
    expect(r.preserved).toEqual(expect.arrayContaining(["scripts/voice.mjs", "scripts/run.sh"]));
    expect(read(outside, "voice.mjs")).toBe("someone else's file");
    expect(files(outside)).toEqual(["voice.mjs"]);
  });

  it("skips a file when a folder sits where it belongs, instead of stopping halfway", () => {
    mkdirSync(join(work, "src/Root.tsx"), { recursive: true });
    const r = run();
    expect(r.preserved).toEqual(["src/Root.tsx"]);
    expect(has(work, "src/kit/theme.ts")).toBe(true);
  });

  it("keeps two saved copies made in the same second apart", () => {
    run();
    writeFileSync(join(work, "src/kit/theme.ts"), "edit one");
    writeFileSync(join(program, "src/kit/theme.ts"), "theme v2");
    run({ version: "2", now: new Date("2026-11-20T10:00:00.000Z") });
    writeFileSync(join(work, "src/kit/theme.ts"), "edit two");
    writeFileSync(join(program, "src/kit/theme.ts"), "theme v3");
    run({ version: "3", now: new Date("2026-11-20T10:00:00.500Z") });
    expect(files(join(work, ".reel-studio/overwritten")).sort()).toHaveLength(2);
  });
});
