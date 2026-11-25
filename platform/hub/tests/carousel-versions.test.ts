import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listVersions, restoreVersion, snapshotCarousel, versionFile } from "../src/carousels/versions.js";

let dir: string;
const put = (n: number, text: string) => writeFileSync(join(dir, `slide-${n}.png`), text);
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "carver-")); put(1, "one-A"); put(2, "two-A"); writeFileSync(join(dir, "caption.md"), "caption A"); writeFileSync(join(dir, "alt.json"), '["a1","a2"]'); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("carousel versions", () => {
  it("keeps the slides, alt texts and caption with a label, newest first", () => {
    snapshotCarousel(dir, new Date("2026-11-25T10:00:00Z"), "Before making it again: bigger titles");
    put(1, "one-B");
    snapshotCarousel(dir, new Date("2026-11-25T11:00:00Z"), "Before changing slide 1");
    const v = listVersions(dir);
    expect(v.map((x) => x.label)).toEqual(["Before changing slide 1", "Before making it again: bigger titles"]);
    expect(v[0]).toMatchObject({ slides: ["slide-1.png", "slide-2.png"], hasAlt: true, hasCaption: true });
    expect(readFileSync(versionFile(dir, v[1]!.id, "slide-1.png")!, "utf8")).toBe("one-A");
  });
  it("lists an older snapshot that has no meta.json, and ignores an empty folder", () => {
    mkdirSync(join(dir, "versions/2026-11-24T00-00-00-000Z"), { recursive: true });
    writeFileSync(join(dir, "versions/2026-11-24T00-00-00-000Z/slide-1.png"), "old");
    mkdirSync(join(dir, "versions/empty"));
    const v = listVersions(dir);
    expect(v).toHaveLength(1);
    expect(v[0]?.label).toBe("");
  });
  it("goes back to a version after keeping the current one, and drops a slide the version does not have", () => {
    const id = snapshotCarousel(dir, new Date("2026-11-25T10:00:00Z"), "first");
    put(1, "one-B"); put(3, "three-B"); writeFileSync(join(dir, "caption.md"), "caption B");
    const r = restoreVersion(dir, id, new Date("2026-11-25T12:00:00Z"));
    expect(r?.slides).toBe(2);
    expect(readFileSync(join(dir, "slide-1.png"), "utf8")).toBe("one-A");
    expect(existsSync(join(dir, "slide-3.png"))).toBe(false);
    expect(readFileSync(join(dir, "caption.md"), "utf8")).toBe("caption A");
    // what was current is now a version too
    const kept = listVersions(dir).find((x) => x.id === r!.kept)!;
    expect(kept.label).toContain("Before going back to first");
    expect(readFileSync(versionFile(dir, kept.id, "slide-3.png")!, "utf8")).toBe("three-B");
  });
  it("refuses an unknown version and an unsafe name", () => {
    expect(restoreVersion(dir, "nope")).toBeNull();
    const id = snapshotCarousel(dir);
    expect(versionFile(dir, id, "../../etc/passwd")).toBeNull();
    expect(versionFile(dir, "..", "slide-1.png")).toBeNull();
    expect(versionFile(dir, id, "plan.md")).toBeNull();
  });
  it("keeps only the newest twenty", () => {
    for (let i = 0; i < 23; i++) snapshotCarousel(dir, new Date(Date.UTC(2026, 10, 25, 10, i)));
    expect(readdirSync(join(dir, "versions"))).toHaveLength(20);
  });
});
