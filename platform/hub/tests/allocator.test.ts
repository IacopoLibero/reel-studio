import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allocateReelFolder, shortName, withFileLock } from "../src/factory/allocator.js";

let root: string, locks: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hub-alloc-"));
  locks = join(root, "locks");
  mkdirSync(join(root, "reels/acme/3-old"), { recursive: true });
  mkdirSync(join(root, "reels/acme/21-newer"), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("shortName", () => {
  it("makes a short slug without filler words", () => {
    expect(shortName("What does one wrong order really cost your kitchen?")).toBe("one-wrong-order-really-cost");
    expect(shortName("Do you really need an app for QR ordering?")).toBe("really-need-app-qr-ordering");
    expect(shortName("???")).toBe("reel");
  });
});

describe("allocateReelFolder", () => {
  it("takes the next free number and creates the folder", async () => {
    const a = await allocateReelFolder(root, "acme", "How do you stop paying?", locks);
    expect(a.folder).toBe("22-stop-paying");
    expect(existsSync(a.path)).toBe(true);
  });
  it("never collides under parallel calls", async () => {
    const all = await Promise.all(Array.from({ length: 8 }, (_, i) => allocateReelFolder(root, "acme", `Question number ${i}?`, locks)));
    const ns = all.map((x) => x.n);
    expect(new Set(ns).size).toBe(8);
    expect(Math.min(...ns)).toBe(22);
    expect(Math.max(...ns)).toBe(29);
  });
  it("starts at 0 for a new brand", async () => {
    expect((await allocateReelFolder(root, "fresh", "Hello there world?", locks)).n).toBe(0);
  });
  it("rejects unsafe brand names", async () => {
    await expect(allocateReelFolder(root, "../x", "q?", locks)).rejects.toThrow(/brand/);
  });
});

describe("withFileLock", () => {
  it("serialises critical sections", async () => {
    let active = 0, max = 0;
    await Promise.all(Array.from({ length: 5 }, () => withFileLock(join(locks, "x.lock"), async () => {
      active++; max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
    })));
    expect(max).toBe(1);
  });
  it("releases the lock when the callback throws", async () => {
    await expect(withFileLock(join(locks, "y.lock"), async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await expect(withFileLock(join(locks, "y.lock"), async () => 5)).resolves.toBe(5);
  });
});
