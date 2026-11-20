import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runLayoutCli } from "../src/layout/cli.js";
import { buildLegacy } from "./helpers/legacy-layout.js";
import { files, has, put } from "./helpers/tree.js";

let tmp: string, legacy: string, legacyData: string, chrome: string, home: string, out: string[];
const run = (args: string[], lock = true): number =>
  runLayoutCli([...args, ...(lock ? ["--ignore-browser-lock"] : []), "--legacy-root", legacy, "--legacy-data", legacyData, "--chrome-root", chrome, "--home", home], { write: (t) => out.push(t) }, new Date("2026-11-20T12:00:00Z"));
const text = (): string => out.join("");

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "layout-cli-"));
  legacy = join(tmp, "repo"); legacyData = join(legacy, "platform/data"); chrome = join(tmp, "volume/chrome-profile"); home = join(tmp, "studio");
  out = [];
  buildLegacy({ legacy, legacyData, chrome });
  put(legacy, "package.json", JSON.stringify({ version: "9.9.9" }));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("runLayoutCli", () => {
  it("shows the plan and writes nothing without --apply", () => {
    expect(run([])).toBe(0);
    expect(text()).toMatch(/Dry run/);
    expect(text()).toMatch(/reels/);
    expect(text()).toMatch(/--apply/);
    expect(files(home)).toEqual([]);
  });

  it("with --apply copies the files, fills the workspace with the program's files and says what is left to do", () => {
    expect(run(["--apply"])).toBe(0);
    expect(has(home, "workspace/reels/acme/1-x/x.mp4")).toBe(true);
    expect(has(home, "workspace/src/kit/theme.ts")).toBe(true);
    expect(has(home, "workspace/src/r1/R1.tsx")).toBe(true);
    expect(has(home, "data/brands/acme/profile/Default/Cookies")).toBe(true);
    expect(has(home, "workspace/.reel-studio/program.json")).toBe(true);
    expect(text()).toMatch(/originals were not touched/i);
    expect(has(legacy, "reels/acme/1-x/x.mp4")).toBe(true);
  });

  it("stops with an error code while a job is running", () => {
    put(legacyData, "jobs.json", JSON.stringify([{ type: "reel.make", status: "running" }]));
    expect(run(["--apply"])).toBe(1);
    expect(text()).toMatch(/job/);
    expect(files(home)).toEqual([]);
  });

  it("says so when it was already done", () => {
    run(["--apply"]);
    out = [];
    expect(run(["--apply"])).toBe(0);
    expect(text()).toMatch(/already/i);
  });

  it("rejects an unknown option", () => {
    expect(run(["--wipe"])).toBe(2);
    expect(text()).toMatch(/Usage/);
  });

  it("tells the user to stop the hub when a login folder looks in use", () => {
    expect(run(["--apply"], false)).toBe(1);
    expect(text()).toMatch(/stop the hub/i);
    expect(files(home)).toEqual([]);
  });
});
