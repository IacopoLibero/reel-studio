import { describe, it, expect } from "vitest";
import { DEFAULT_PATTERN, nextSlots, zonedToUtc, minutesAhead } from "../src/slots.js";

describe("zonedToUtc", () => {
  it("converts Rome winter and summer time", () => {
    expect(zonedToUtc("2026-11-20", "17:30", "Europe/Rome").toISOString()).toBe("2026-11-20T16:30:00.000Z");
    expect(zonedToUtc("2026-07-20", "17:30", "Europe/Rome").toISOString()).toBe("2026-07-20T15:30:00.000Z");
  });
});

describe("nextSlots", () => {
  // 2026-11-19 is a Thursday
  const now = new Date("2026-11-19T10:00:00Z"); // 11:00 Rome
  it("uses the Sun/Tue/Thu pattern", () => {
    const s = nextSlots(DEFAULT_PATTERN, now, 5);
    expect(s.map((x) => `${x.date} ${x.time}`)).toEqual([
      "2026-11-19 16:30", "2026-11-19 19:00", "2026-11-20 07:30", "2026-11-20 17:30", "2026-11-21 07:30",
    ]);
  });
  it("skips slots less than 20 minutes ahead", () => {
    const n = new Date("2026-11-19T15:15:00Z"); // 16:15 Rome, 16:30 is 15 min ahead
    expect(nextSlots(DEFAULT_PATTERN, n, 1)[0]?.time).toBe("19:00");
  });
  it("marks taken slots", () => {
    const s = nextSlots(DEFAULT_PATTERN, now, 2, { taken: new Set(["2026-11-19 16:30"]) });
    expect(s[0]?.taken).toBe(true);
    expect(s[1]?.taken).toBe(false);
  });
  it("handles sunday and empty days", () => {
    const p = { timezone: "Europe/Rome", days: [["08:00"], [], [], [], [], [], []] };
    const s = nextSlots(p, new Date("2026-11-19T10:00:00Z"), 2);
    expect(s.map((x) => x.date)).toEqual(["2026-11-22", "2026-11-29"]);
  });
  it("has a label and iso", () => {
    const s = nextSlots(DEFAULT_PATTERN, now, 1)[0]!;
    expect(s.label).toBe("Thu 19 Nov 16:30");
    expect(s.iso).toBe("2026-11-19T15:30:00.000Z");
  });
});

describe("minutesAhead", () => {
  it("measures the lead time", () => {
    expect(minutesAhead("2026-11-19", "12:00", "Europe/Rome", new Date("2026-11-19T10:30:00Z"))).toBe(30);
  });
});
