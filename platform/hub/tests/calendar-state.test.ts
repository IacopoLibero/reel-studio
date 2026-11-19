import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyDelete, applyReschedule } from "../src/calendar/state.js";

let dir: string, file: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "hub-cal-")); file = join(dir, "scheduled.json"); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const read = () => JSON.parse(readFileSync(file, "utf8"));

describe("scheduled.json updates", () => {
  it("moves the slot of a rescheduled reel and keeps other fields", () => {
    writeFileSync(file, JSON.stringify({ "a/1-x": { slot: "2026-11-20T17:30", verified: true }, "a/2-y": { slot: "2026-11-21T07:30" } }));
    applyReschedule(file, "a/1-x", "2026-11-25T07:00:00.000Z", "Europe/Rome");
    expect(read()["a/1-x"]).toEqual({ slot: "2026-11-25T08:00", verified: true });
    expect(read()["a/2-y"].slot).toBe("2026-11-21T07:30");
  });
  it("removes a deleted reel", () => {
    writeFileSync(file, JSON.stringify({ "a/1-x": { slot: "s" }, "a/2-y": { slot: "t" } }));
    applyDelete(file, "a/1-x");
    expect(Object.keys(read())).toEqual(["a/2-y"]);
  });
  it("ignores unknown keys, null keys and missing or corrupt files", () => {
    applyDelete(file, "a/1-x"); applyReschedule(file, "a/1-x", "2026-11-25T07:00:00Z", "Europe/Rome");
    expect(existsSync(file)).toBe(false);
    writeFileSync(file, "garbage");
    applyDelete(file, "a/1-x"); applyReschedule(file, null, "2026-11-25T07:00:00Z", "Europe/Rome");
    expect(readFileSync(file, "utf8")).toBe("garbage");
  });
});
