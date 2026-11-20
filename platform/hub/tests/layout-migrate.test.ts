import { mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateLayout, type MigrateOptions } from "../src/layout/migrate.js";
import { buildLegacy } from "./helpers/legacy-layout.js";
import { files, has, put, read } from "./helpers/tree.js";

let tmp: string, legacy: string, legacyData: string, chrome: string, workspace: string, data: string;

const opts = (extra: Partial<MigrateOptions> = {}): MigrateOptions => ({
  legacyRoot: legacy, legacyData, chromeRoot: chrome, workspace, data, apply: true, ignoreBrowserLock: true, now: new Date("2026-11-20T12:00:00Z"), ...extra,
});

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "layout-migrate-"));
  legacy = join(tmp, "repo"); legacyData = join(legacy, "platform/data"); chrome = join(tmp, "volume/chrome-profile");
  workspace = join(tmp, "studio/workspace"); data = join(tmp, "studio/data");
  buildLegacy({ legacy, legacyData, chrome });
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("migrateLayout", () => {
  it("only plans on a dry run and writes nothing", () => {
    const r = migrateLayout(opts({ apply: false }));
    expect(r.status).toBe("planned");
    expect(r.items.map((i) => i.to).some((t) => t.endsWith("reels"))).toBe(true);
    expect(files(workspace)).toEqual([]);
    expect(files(data)).toEqual([]);
  });

  it("copies the author's files into the workspace and none of the program or caches", () => {
    const r = migrateLayout(opts());
    expect(r.status).toBe("applied");
    expect(r.verified).toBe(true);
    expect(r.problems).toEqual([]);
    expect(files(workspace).filter((f) => !f.startsWith(".reel-studio"))).toEqual([
      ".agents/skills/x/SKILL.md", ".claude/settings.local.json", ".claude/skills/ootto-hook-mining/SKILL.md", ".claude/skills/remotion-best-practices/SKILL.md",
      "brand/acme/brand.json", "brand/acme/style.md", "mascot/m.py", "public/a1/ding.wav", "public/a1/friendly.wav", "public/mascot/idle/0.png",
      "reels/acme/1-x/caption.md", "reels/acme/1-x/x.mp4", "skills-lock.json", "src/Root.private.tsx", "src/r1/R1.tsx",
    ]);
    expect(has(workspace, "src/kit")).toBe(false);
    expect(has(workspace, "node_modules")).toBe(false);
    expect(has(workspace, "whisper.cpp")).toBe(false);
    expect(has(workspace, "brand/_template")).toBe(false);
  });

  it("copies the hub data without the temporary uploads", () => {
    migrateLayout(opts());
    expect(files(data).filter((f) => !f.includes("profile") && !f.startsWith("MIGRATED"))).toEqual([
      "brands/acme/analytics/2026-11-20.json", "brands/acme/scheduled.json", "brands/acme/settings.json", "jobs.json", "settings.json",
    ]);
  });

  it("moves the Instagram login next to the brand, without the lock files", () => {
    migrateLayout(opts());
    expect(files(join(data, "brands/acme/profile"))).toEqual(["Default/Cookies", "Local State"]);
    expect(read(data, "brands/acme/profile/Default/Cookies")).toBe("cookie jar");
  });

  it("clears the brand's own profile folder so the default (inside the brand's data) applies", () => {
    migrateLayout(opts());
    const b = JSON.parse(read(workspace, "brand/acme/brand.json"));
    expect(b.instagram.profileDir).toBeNull();
    expect(b.instagram.account).toBe("acme");
  });

  it("uses <chromeRoot>/<slug> when the brand has no folder of its own", () => {
    put(legacy, "brand/acme/brand.json", JSON.stringify({ slug: "acme", instagram: { profileDir: null } }));
    put(chrome, "acme/Default/Cookies", "own jar");
    migrateLayout(opts());
    expect(read(data, "brands/acme/profile/Default/Cookies")).toBe("own jar");
  });

  it("leaves the originals untouched", () => {
    const before = { repo: files(legacy), vol: files(chrome) };
    migrateLayout(opts());
    expect(files(legacy)).toEqual(before.repo);
    expect(files(chrome)).toEqual(before.vol);
    expect(read(legacy, "brand/acme/brand.json")).toContain(chrome);
  });

  it("warns, and still applies, when a brand's login folder does not exist", () => {
    rmSync(chrome, { recursive: true });
    const r = migrateLayout(opts());
    expect(r.status).toBe("applied");
    expect(r.warnings.join(" ")).toMatch(/acme.*login/i);
    expect(has(data, "brands/acme/profile")).toBe(false);
  });

  it("is a no-op the second time", () => {
    migrateLayout(opts());
    expect(migrateLayout(opts()).status).toBe("already");
  });

  it("refuses while a job is queued or running", () => {
    put(legacyData, "jobs.json", JSON.stringify([{ id: "1", type: "reel.make", status: "running" }]));
    const r = migrateLayout(opts());
    expect(r.status).toBe("blocked");
    expect(r.problems.join(" ")).toMatch(/job/);
    expect(files(workspace)).toEqual([]);
  });

  it("refuses to write over a workspace that already has files", () => {
    put(workspace, "reels/other/1/a.mp4");
    const r = migrateLayout(opts());
    expect(r.status).toBe("blocked");
    expect(r.problems.join(" ")).toMatch(/not empty/);
    expect(has(workspace, "brand")).toBe(false);
  });

  it("writes a marker and a log the user can read", () => {
    migrateLayout(opts());
    const marker = JSON.parse(read(data, "MIGRATED-FROM-LEGACY.json"));
    expect(marker.at).toBe("2026-11-20T12:00:00.000Z");
    expect(marker.legacyRoot).toBe(legacy);
    expect(read(workspace, ".reel-studio/migration.log")).toContain("reels");
  });

  it("reports a copy that does not match the original", () => {
    const r = migrateLayout(opts({ afterCopy: (item) => { if (item.to.endsWith("reels")) rmSync(join(item.to, "acme/1-x/x.mp4")); } }));
    expect(r.verified).toBe(false);
    expect(r.problems.join(" ")).toMatch(/reels/);
  });

  it("does not call a copy good when only the content differs, not the size", () => {
    const r = migrateLayout(opts({ afterCopy: (item) => { if (item.to.endsWith("reels")) writeFileSync(join(item.to, "acme/1-x/x.mp4"), "VIDEO BYTES"); } }));
    expect(r.verified).toBe(false);
    expect(r.problems.join(" ")).toMatch(/differ/);
  });

  it("a failed verification leaves a failure marker, never the success one, and a rerun is stopped with a clear message", () => {
    migrateLayout(opts({ afterCopy: (item) => { if (item.to.endsWith("reels")) rmSync(join(item.to, "acme/1-x/x.mp4")); } }));
    expect(has(data, "MIGRATED-FROM-LEGACY.json")).toBe(false);
    expect(has(data, "MIGRATION-FAILED.json")).toBe(true);
    const again = migrateLayout(opts());
    expect(again.status).toBe("blocked");
    expect(again.problems.join(" ")).toMatch(/previous migration/);
  });

  it("stops at an error while copying, logs it and reports it", () => {
    const r = migrateLayout(opts({ afterCopy: () => { throw new Error("disk full"); } }));
    expect(r.verified).toBe(false);
    expect(r.problems.join(" ")).toMatch(/disk full/);
    expect(has(data, "MIGRATION-FAILED.json")).toBe(true);
    expect(read(workspace, ".reel-studio/migration.log")).toContain("FAILED");
  });

  it("finds the login of a brand whose saved folder is a container path, using the folder given for it", () => {
    put(legacy, "brand/acme/brand.json", JSON.stringify({ slug: "acme", instagram: { profileDir: "/data/chrome-profile" } }));
    const r = migrateLayout(opts());
    expect(r.warnings).toEqual([]);
    expect(read(data, "brands/acme/profile/Default/Cookies")).toBe("cookie jar");
    expect(JSON.parse(read(workspace, "brand/acme/brand.json")).instagram.profileDir).toBeNull();
  });

  it("names the places it looked when no login is found", () => {
    rmSync(chrome, { recursive: true });
    expect(migrateLayout(opts()).warnings.join(" ")).toContain(join(chrome, "acme"));
  });

  it("refuses a login folder that looks in use, unless told to ignore the lock", () => {
    const blocked = migrateLayout(opts({ ignoreBrowserLock: false }));
    expect(blocked.status).toBe("blocked");
    expect(blocked.problems.join(" ")).toMatch(/in use/);
    expect(files(workspace)).toEqual([]);
    expect(migrateLayout(opts({ ignoreBrowserLock: true })).status).toBe("applied");
  });

  it("refuses when jobs.json exists but cannot be read", () => {
    put(legacyData, "jobs.json", "{not json");
    const r = migrateLayout(opts());
    expect(r.status).toBe("blocked");
    expect(r.problems.join(" ")).toMatch(/cannot be read/);
  });

  it("refuses a symbolic link inside a copied folder instead of copying a link back into the old tree", () => {
    symlinkSync(join(legacy, "reels/acme"), join(legacy, "reels/shortcut"));
    const r = migrateLayout(opts());
    expect(r.status).toBe("blocked");
    expect(r.problems.join(" ")).toMatch(/Symbolic link/);
    expect(files(workspace)).toEqual([]);
  });

  it("recreates the switched-on Ootto skills as links, as they were written", () => {
    put(legacy, "platform/skills/ootto/hook-mining/SKILL.md");
    rmSync(join(legacy, ".claude/skills/ootto-hook-mining"), { recursive: true });
    mkdirSync(join(legacy, ".claude/skills"), { recursive: true });
    symlinkSync("../../platform/skills/ootto/hook-mining", join(legacy, ".claude/skills/ootto-hook-mining"));
    const r = migrateLayout(opts());
    expect(r.status).toBe("applied");
    expect(r.verified).toBe(true);
    expect(readlinkSync(join(workspace, ".claude/skills/ootto-hook-mining"))).toBe("../../platform/skills/ootto/hook-mining");
  });

  it("refuses a destination inside the old project folder", () => {
    const r = migrateLayout(opts({ workspace: join(legacy, "studio/workspace"), data: join(tmp, "studio2/data") }));
    expect(r.status).toBe("blocked");
    expect(r.problems.join(" ")).toMatch(/nested/);
  });
});
