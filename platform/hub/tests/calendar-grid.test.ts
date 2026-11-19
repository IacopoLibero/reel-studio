import { describe, it, expect } from "vitest";
import { addDays, weekOf, monthGrid, groupByDay, rangeFor, dayOfWeek } from "../src/shared/calendar-grid.js";

describe("calendar grid", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("knows the weekday", () => {
    expect(dayOfWeek("2026-11-19")).toBe(4); // Thursday
    expect(dayOfWeek("2026-11-22")).toBe(0);
  });
  it("builds a Sunday-first week", () => {
    expect(weekOf("2026-11-19")).toEqual(["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"]);
    expect(weekOf("2026-11-15")[0]).toBe("2026-11-15");
    expect(weekOf("2026-11-21")[0]).toBe("2026-11-15");
  });
  it("builds a month grid of whole weeks starting on Sunday", () => {
    const g = monthGrid("2026-11-19");
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g[0]![0]).toBe("2026-11-01");
    expect(g.at(-1)!.at(-1)).toBe("2026-12-05");
    expect(g.flat()).toContain("2026-11-30");
    const feb = monthGrid("2026-02-10");
    expect(feb).toHaveLength(4);
    expect(feb[0]![0]).toBe("2026-02-01");
  });
  it("groups items by day sorted by time", () => {
    const g = groupByDay([{ date: "2026-11-20", time: "17:30" }, { date: "2026-11-20", time: "07:30" }, { date: "2026-11-21", time: "08:00" }]);
    expect(g["2026-11-20"]!.map((x) => x.time)).toEqual(["07:30", "17:30"]);
    expect(Object.keys(g)).toHaveLength(2);
  });
  it("gives the range of a view", () => {
    expect(rangeFor("week", "2026-11-19")).toEqual({ from: "2026-11-15", to: "2026-11-21" });
    expect(rangeFor("month", "2026-11-19")).toEqual({ from: "2026-11-01", to: "2026-12-05" });
  });
});
