import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dropSnapshotIfUnchanged, snapshotReel, VERSIONS_DIR } from "../src/reels/versions.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "reel-ver-"));
  writeFileSync(join(dir, "a.mp4"), "video-1"); writeFileSync(join(dir, "caption.md"), "cap"); writeFileSync(join(dir, "cover.png"), "png");
  writeFileSync(join(dir, "script.json"), "{}"); writeFileSync(join(dir, "plan.md"), "plan");
  mkdirSync(join(dir, "code")); writeFileSync(join(dir, "code", "Scenes.tsx"), "scenes");
  mkdirSync(join(dir, "audio")); writeFileSync(join(dir, "audio", "narrator.wav"), "x".repeat(1000));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("snapshotReel", () => {
  it("copies the deliverables and the code, but not the audio (large, and unchanged by most edits)", () => {
    const name = snapshotReel(dir, new Date("2026-11-22T10:00:00Z"));
    const snap = join(dir, VERSIONS_DIR, name);
    expect(readFileSync(join(snap, "a.mp4"), "utf8")).toBe("video-1");
    expect(readFileSync(join(snap, "code", "Scenes.tsx"), "utf8")).toBe("scenes");
    expect(["caption.md", "cover.png", "script.json", "plan.md"].every((f) => existsSync(join(snap, f)))).toBe(true);
    expect(existsSync(join(snap, "audio"))).toBe(false);
  });
  it("names a snapshot by its time and keeps the newest three", () => {
    const names = [1, 2, 3, 4, 5].map((h) => snapshotReel(dir, new Date(`2026-11-22T0${h}:00:00Z`)));
    const kept = readdirSync(join(dir, VERSIONS_DIR)).sort();
    expect(kept).toHaveLength(3);
    expect(kept).toEqual(names.slice(2).sort());
  });
  it("does not copy older snapshots into a new one", () => {
    snapshotReel(dir, new Date("2026-11-22T01:00:00Z"));
    const name = snapshotReel(dir, new Date("2026-11-22T02:00:00Z"));
    expect(existsSync(join(dir, VERSIONS_DIR, name, VERSIONS_DIR))).toBe(false);
  });
  it("works for a reel with no code folder", () => {
    rmSync(join(dir, "code"), { recursive: true });
    expect(() => snapshotReel(dir)).not.toThrow();
  });

  it("drops a snapshot when nothing changed since (a question, a failed run), and keeps it when something did", () => {
    const same = snapshotReel(dir, new Date("2026-11-22T01:00:00Z"));
    expect(dropSnapshotIfUnchanged(dir, same)).toBe(true);
    expect(existsSync(join(dir, VERSIONS_DIR, same))).toBe(false);
    for (const change of [() => writeFileSync(join(dir, "a.mp4"), "video-2"), () => writeFileSync(join(dir, "code", "Scenes.tsx"), "new"), () => writeFileSync(join(dir, "code", "New.tsx"), "n"), () => rmSync(join(dir, "cover.png"))]) {
      const name = snapshotReel(dir, new Date("2026-11-22T02:00:00Z"));
      change();
      expect(dropSnapshotIfUnchanged(dir, name)).toBe(false);
      expect(existsSync(join(dir, VERSIONS_DIR, name))).toBe(true);
      rmSync(join(dir, VERSIONS_DIR), { recursive: true, force: true });
      writeFileSync(join(dir, "a.mp4"), "video-1"); writeFileSync(join(dir, "code", "Scenes.tsx"), "scenes"); rmSync(join(dir, "code", "New.tsx"), { force: true }); writeFileSync(join(dir, "cover.png"), "png");
    }
  });
});
