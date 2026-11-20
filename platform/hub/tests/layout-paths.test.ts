import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { brandPaths, explicitChromeRoot } from "../src/brands/paths.js";
import { isProgramPath, PROGRAM_ENTRIES, REPO_ONLY_PREFIXES } from "../src/layout/manifest.js";
import { defaultDataDir, defaultProgramRoot, defaultRoot, studioHome } from "../src/paths.js";

describe("studio folders", () => {
  it("REEL_ROOT and HUB_DATA win over everything", () => {
    const env = { REEL_ROOT: "/w", HUB_DATA: "/d", REEL_STUDIO_HOME: "/s" };
    expect(defaultRoot(env)).toBe("/w");
    expect(defaultDataDir(env)).toBe("/d");
  });

  it("REEL_STUDIO_HOME gives the workspace and the data folder", () => {
    expect(defaultRoot({ REEL_STUDIO_HOME: "/s" })).toBe("/s/workspace");
    expect(defaultDataDir({ REEL_STUDIO_HOME: "/s" })).toBe("/s/data");
  });

  it("without any of them the project folder is the root, as before", () => {
    expect(defaultRoot({})).toBe(defaultProgramRoot());
    expect(defaultDataDir({})).toBe(join(defaultProgramRoot(), "platform/data"));
  });

  it("the studio home defaults to ~/ReelStudio", () => {
    expect(studioHome({ HOME: "/home/me" })).toBe("/home/me/ReelStudio");
    expect(studioHome({ HOME: "/home/me", REEL_STUDIO_HOME: "/elsewhere" })).toBe("/elsewhere");
  });
});

describe("a brand's Instagram login", () => {
  it("lives inside the brand's data folder by default", () => {
    expect(brandPaths("acme", { root: "/r", dataDir: "/d", env: { CHROME_PROFILE_ROOT: "/nowhere-at-all" } }).profileDir).toBe(join("/d", "brands/acme/profile"));
  });

  it("keeps using the old shared profile folder while the new place does not exist yet, so no install loses its login", () => {
    const tmp = mkdtempSync(join(tmpdir(), "profile-"));
    try {
      mkdirSync(join(tmp, "old/acme"), { recursive: true });
      const env = { CHROME_PROFILE_ROOT: join(tmp, "old") };
      expect(brandPaths("acme", { root: "/r", dataDir: join(tmp, "data"), env }).profileDir).toBe(join(tmp, "old/acme"));
      mkdirSync(join(tmp, "data/brands/acme/profile"), { recursive: true });
      expect(brandPaths("acme", { root: "/r", dataDir: join(tmp, "data"), env }).profileDir).toBe(join(tmp, "data/brands/acme/profile"));
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  });

  it("follows an old shared profile root or an own folder when one is given", () => {
    expect(brandPaths("acme", { root: "/r", dataDir: "/d", chromeRoot: "/c" }).profileDir).toBe("/c/acme");
    expect(brandPaths("acme", { root: "/r", dataDir: "/d", chromeRoot: "/c", profileDir: "/own" }).profileDir).toBe("/own");
  });

  it("only an explicit environment variable selects an old shared profile root", () => {
    expect(explicitChromeRoot({})).toBeNull();
    expect(explicitChromeRoot({ CHROME_PROFILE_ROOT: "/new", CHROME_PROFILE: "/old" })).toBe("/new");
    expect(explicitChromeRoot({ CHROME_PROFILE: "/old" })).toBe("/old");
  });
});

describe("the program manifest", () => {
  it("knows which paths are the program's", () => {
    expect(isProgramPath("src/kit/theme.ts")).toBe(true);
    expect(isProgramPath("src/Root.tsx")).toBe(true);
    expect(isProgramPath("src/r1/R1.tsx")).toBe(false);
    expect(isProgramPath("src/Root.private.tsx")).toBe(false);
    expect(isProgramPath("src/kitchen/x.ts")).toBe(false);
  });

  it("covers every file git tracks, so none is forgotten when a file is added", () => {
    let tracked: string[];
    try {
      tracked = execFileSync("git", ["ls-files"], { cwd: resolve(defaultProgramRoot()), encoding: "utf8" }).split("\n").filter(Boolean);
    } catch { return; /* not a git checkout (a release archive): nothing to compare */ }
    const uncovered = tracked.filter((f) => !isProgramPath(f) && !REPO_ONLY_PREFIXES.some((p) => f === p || f.startsWith(p)));
    expect(uncovered).toEqual([]);
    for (const e of PROGRAM_ENTRIES) expect(tracked.some((f) => f === e || f.startsWith(`${e}/`)), `${e} is tracked`).toBe(true);
  });
});
