import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readReelDetail } from "../src/reels/detail.js";

let reels: string;
beforeEach(() => { reels = mkdtempSync(join(tmpdir(), "reel-detail-")); });
afterEach(() => rmSync(reels, { recursive: true, force: true }));
const reel = (folder: string, files: Record<string, string>) => {
  const d = join(reels, folder); mkdirSync(d, { recursive: true });
  for (const [f, c] of Object.entries(files)) { mkdirSync(join(d, f, ".."), { recursive: true }); writeFileSync(join(d, f), c); }
};

describe("readReelDetail", () => {
  it("is null for a folder that is not a reel or does not exist", () => {
    expect(readReelDetail(reels, "nope", "acme", {})).toBeNull();
    expect(readReelDetail(reels, "../x", "acme", {})).toBeNull();
  });
  it("reads the caption, the script sentences, the plan and the files", () => {
    reel("3-half-loaf", {
      "half.mp4": "video", "caption.md": "Line one\n\n#tag", "cover.png": "png", "plan.md": "# Plan\nscene 1",
      "script.json": JSON.stringify({ sentences: ["Hello.", "World."] }), "audio/narrator.wav": "x", "code/Scenes.tsx": "s",
    });
    const d = readReelDetail(reels, "3-half-loaf", "acme", {})!;
    expect(d).toMatchObject({ key: "acme/3-half-loaf", folder: "3-half-loaf", n: 3, name: "half-loaf", mp4: "half.mp4", caption: "Line one\n\n#tag", plan: "# Plan\nscene 1", script: ["Hello.", "World."], hasCover: true, hasCode: true });
    expect(d.files.map((f) => f.name).sort()).toEqual(["audio", "caption.md", "code", "cover.png", "half.mp4", "plan.md", "script.json"]);
    expect(d.files.find((f) => f.name === "half.mp4")).toMatchObject({ size: 5, dir: false });
    expect(d.files.find((f) => f.name === "code")).toMatchObject({ dir: true });
  });
  it("gives a version number that changes when the video changes, so the page reloads it", () => {
    reel("1-a", { "a.mp4": "v1" });
    const v1 = readReelDetail(reels, "1-a", "acme", {})!.version;
    writeFileSync(join(reels, "1-a", "a.mp4"), "v2 longer");
    expect(readReelDetail(reels, "1-a", "acme", {})!.version).not.toBe(v1);
  });
  it("does not list the hidden version and chat files, and tolerates a missing or odd script", () => {
    reel("2-b", { "b.mp4": "v", ".versions/x/b.mp4": "old", "chat.json": "{}", "script.json": "not json" });
    const d = readReelDetail(reels, "2-b", "acme", {})!;
    expect(d.files.map((f) => f.name).sort()).toEqual(["b.mp4", "script.json"]);
    expect(d.script).toEqual([]);
    expect(d.caption).toBe("");
  });
  it("carries the Instagram schedule of the reel", () => {
    reel("4-c", { "c.mp4": "v" });
    expect(readReelDetail(reels, "4-c", "acme", { "acme/4-c": { at: "2026-12-01 09:00", status: "scheduled" } })!.schedule).toEqual({ at: "2026-12-01 09:00", status: "scheduled" });
  });
});
