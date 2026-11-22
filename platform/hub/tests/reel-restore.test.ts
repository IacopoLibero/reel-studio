import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listVersions, restoreVersion, snapshotReel, VERSIONS_DIR } from "../src/reels/versions.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "reel-restore-"));
  writeFileSync(join(dir, "a.mp4"), "video-1"); writeFileSync(join(dir, "caption.md"), "cap-1"); writeFileSync(join(dir, "cover.png"), "png-1");
  mkdirSync(join(dir, "code")); writeFileSync(join(dir, "code", "Scenes.tsx"), "scenes-1");
  mkdirSync(join(dir, "audio")); writeFileSync(join(dir, "audio", "narrator.wav"), "audio");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("listVersions", () => {
  it("is empty without snapshots, then lists them newest first with their time", () => {
    expect(listVersions(dir)).toEqual([]);
    snapshotReel(dir, new Date("2026-11-22T10:00:00Z"));
    snapshotReel(dir, new Date("2026-11-22T11:00:00Z"));
    expect(listVersions(dir).map((v) => v.at)).toEqual(["2026-11-22T11:00:00.000Z", "2026-11-22T10:00:00.000Z"]);
    expect(listVersions(dir)[0]?.name).toBe("2026-11-22T11-00-00-000Z");
  });
});

describe("restoreVersion", () => {
  it("puts the saved video, caption, cover and code back, removes files the change added, and leaves the audio alone", () => {
    const old = snapshotReel(dir, new Date("2026-11-22T10:00:00Z"));
    writeFileSync(join(dir, "a.mp4"), "video-2"); writeFileSync(join(dir, "caption.md"), "cap-2"); writeFileSync(join(dir, "cover.png"), "png-2");
    writeFileSync(join(dir, "code", "Scenes.tsx"), "scenes-2"); writeFileSync(join(dir, "code", "Extra.tsx"), "extra");
    writeFileSync(join(dir, "audio", "narrator.wav"), "audio-2");
    restoreVersion(dir, old);
    expect(readFileSync(join(dir, "a.mp4"), "utf8")).toBe("video-1");
    expect(readFileSync(join(dir, "caption.md"), "utf8")).toBe("cap-1");
    expect(readFileSync(join(dir, "cover.png"), "utf8")).toBe("png-1");
    expect(readFileSync(join(dir, "code", "Scenes.tsx"), "utf8")).toBe("scenes-1");
    expect(existsSync(join(dir, "code", "Extra.tsx"))).toBe(false);
    expect(readFileSync(join(dir, "audio", "narrator.wav"), "utf8")).toBe("audio-2");
  });
  it("first saves the reel as it is now, so the undo can be undone", () => {
    const old = snapshotReel(dir, new Date("2026-11-22T10:00:00Z"));
    writeFileSync(join(dir, "a.mp4"), "video-2");
    restoreVersion(dir, old, new Date("2026-11-22T12:00:00Z"));
    const now = listVersions(dir).find((v) => v.name !== old);
    expect(now).toBeDefined();
    restoreVersion(dir, now!.name);
    expect(readFileSync(join(dir, "a.mp4"), "utf8")).toBe("video-2");
  });
  it("refuses a name that is not a saved version, or tries to leave the folder", () => {
    expect(() => restoreVersion(dir, "nope")).toThrow(/not found/i);
    expect(() => restoreVersion(dir, "../../etc")).toThrow(/not found/i);
    expect(() => restoreVersion(dir, "..")).toThrow(/not found/i);
    expect(readdirSync(dir).sort()).toEqual(["a.mp4", "audio", "caption.md", "code", "cover.png"]);
  });
  it("keeps the newest three even after an undo", () => {
    const names = [1, 2, 3].map((h) => snapshotReel(dir, new Date(`2026-11-22T0${h}:00:00Z`)));
    restoreVersion(dir, names[0]!, new Date("2026-11-22T09:00:00Z"));
    expect(readdirSync(join(dir, VERSIONS_DIR))).toHaveLength(3);
  });
});
