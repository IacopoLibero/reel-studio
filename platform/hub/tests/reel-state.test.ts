import { describe, expect, it } from "vitest";
import { nowLocal, reelState } from "../src/reels/scanner.js";

const done = { mp4: "a.mp4", hasCaption: true, hasCover: true, schedule: null, scheduling: false };

describe("nowLocal", () => {
  it("writes the time of a zone in the shape of a schedule entry", () => {
    expect(nowLocal("Europe/Rome", new Date("2026-11-24T10:05:00Z"))).toBe("2026-11-24 11:05");
    expect(nowLocal("UTC", new Date("2026-11-24T23:59:00Z"))).toBe("2026-11-24 23:59");
    expect(nowLocal("Europe/Rome", new Date("2026-11-24T23:30:00Z"))).toBe("2026-11-25 00:30");
  });
});

describe("reelState: what the banner says", () => {
  const now = "2026-11-24 12:00";
  it("is to-schedule for a finished reel and incomplete for one that lacks a file", () => {
    expect(reelState(done, now)).toBe("to-schedule");
    expect(reelState({ ...done, hasCover: false }, now)).toBe("incomplete");
    expect(reelState({ ...done, mp4: null }, now)).toBe("incomplete");
  });
  it("is scheduling while an Instagram job runs", () => { expect(reelState({ ...done, scheduling: true }, now)).toBe("scheduling"); });
  it("is scheduled before its time and posted once the time has passed", () => {
    expect(reelState({ ...done, schedule: { at: "2026-11-25 17:30", status: "scheduled" } }, now)).toBe("scheduled");
    expect(reelState({ ...done, schedule: { at: "2026-11-24 11:59", status: "scheduled" } }, now)).toBe("posted");
    expect(reelState({ ...done, schedule: { at: "2026-11-24 12:00", status: "scheduled" } }, now)).toBe("posted");
  });
  it("is posted when the entry says so, whatever the time", () => { expect(reelState({ ...done, schedule: { at: "2027-01-01 08:00", status: "posted" } }, now)).toBe("posted"); });
  it("without a clock only the entry's own status decides", () => { expect(reelState({ ...done, schedule: { at: "2020-01-01 08:00", status: "scheduled" } }, null)).toBe("scheduled"); });
});
