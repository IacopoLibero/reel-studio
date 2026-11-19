import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanReels, resolveReelFile, readScheduled } from "../src/reels/scanner.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hub-reels-"));
  const mk = (p: string, files: Record<string, string>) => {
    mkdirSync(join(root, "reels", p), { recursive: true });
    for (const [f, c] of Object.entries(files)) writeFileSync(join(root, "reels", p, f), c);
  };
  mk("acme/2-first-one", { "a.mp4": "x", "caption.md": "Hello world 👇\n\nMore", "cover.png": "x" });
  mk("acme/10-tenth", { "b.mp4": "x" });
  mk("acme/notareel", { "c.mp4": "x" });
  mk("acme/0-intro", { "caption.md": "A".repeat(300) });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("scanReels", () => {
  it("scans folders numerically and reports status", () => {
    const r = scanReels(root, {});
    expect(r.map((x) => x.folder)).toEqual(["0-intro", "2-first-one", "10-tenth"]);
    const a = r.find((x) => x.n === 2)!;
    expect(a).toMatchObject({ key: "acme/2-first-one", brand: "acme", name: "first-one", mp4: "a.mp4", hasCaption: true, hasCover: true, captionStart: "Hello world 👇" });
    expect(r.find((x) => x.n === 10)).toMatchObject({ mp4: "b.mp4", hasCaption: false, hasCover: false, captionStart: "" });
    expect(r.find((x) => x.n === 0)!.captionStart.length).toBeLessThanOrEqual(121);
  });
  it("attaches schedule state", () => {
    const r = scanReels(root, { "acme/2-first-one": { at: "2026-11-20 17:30", status: "scheduled" } });
    expect(r.find((x) => x.n === 2)!.schedule?.at).toBe("2026-11-20 17:30");
  });
  it("returns an empty list when the folder is missing", () => {
    expect(scanReels(join(root, "nope"), {})).toEqual([]);
  });
});

describe("resolveReelFile", () => {
  it("resolves known files and rejects traversal", () => {
    expect(resolveReelFile(root, "acme/2-first-one", "cover")).toBe(join(root, "reels/acme/2-first-one/cover.png"));
    expect(resolveReelFile(root, "acme/2-first-one", "mp4")).toBe(join(root, "reels/acme/2-first-one/a.mp4"));
    expect(resolveReelFile(root, "../etc", "cover")).toBeNull();
    expect(resolveReelFile(root, "acme/10-tenth", "cover")).toBeNull();
  });
});

describe("readScheduled", () => {
  it("accepts an object, an array and garbage", () => {
    const f = join(root, "s.json");
    writeFileSync(f, JSON.stringify({ "acme/2-first-one": { at: "2026-11-20 17:30", status: "scheduled" } }));
    expect(readScheduled(f)["acme/2-first-one"]?.at).toBe("2026-11-20 17:30");
    writeFileSync(f, JSON.stringify([{ reel: "acme/x", slot: "2026-11-21T07:30" }]));
    expect(readScheduled(f)["acme/x"]?.at).toBe("2026-11-21 07:30");
    writeFileSync(f, "garbage");
    expect(readScheduled(f)).toEqual({});
    expect(readScheduled(join(root, "missing.json"))).toEqual({});
  });
});
