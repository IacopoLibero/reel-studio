import { describe, expect, it } from "vitest";
import { HOOKS_HEADER, toHooksCsv } from "../src/analytics/csv.js";
import type { MediaRecord } from "../src/analytics/schemas.js";

const rec = (o: Partial<MediaRecord>): MediaRecord => ({
  id: "1", permalink: "https://i/r/1", captionStart: "c", hook: "Hook?", postedAt: "2026-11-18T18:00:10+0000", mediaType: "VIDEO", productType: "REELS",
  reel: { key: "b/1-x", n: 1, name: "x", closing: "A" }, metrics: { plays: 10, reach: 8, saves: 1, shares: 2, likes: 3, comments: 4 }, insights: "ok", skipped: [], ...o,
});

describe("toHooksCsv", () => {
  it("writes the documented header and one row per reel, newest first", () => {
    const csv = toHooksCsv([rec({}), rec({ id: "2", hook: "Newer?", postedAt: "2026-11-19T07:00:01+0000" })]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(HOOKS_HEADER.join(","));
    expect(lines[1]).toBe("Newer?,10,8,1,2,3,4,2026-11-19T07:00:01+0000,b/1-x,");
    expect(lines).toHaveLength(3);
  });
  it("skips media that are not reels", () => {
    expect(toHooksCsv([rec({ productType: "FEED" })]).trim().split("\n")).toHaveLength(1);
  });
  it("quotes commas, quotes and newlines, and defuses formulas", () => {
    const csv = toHooksCsv([rec({ hook: 'Say "hi", ok' }), rec({ id: "3", hook: "=SUM(A1)" })]);
    expect(csv).toContain('"Say ""hi"", ok"');
    expect(csv).toContain("'=SUM(A1)");
  });
  it("leaves missing metrics empty and uses the caption when the reel is unmatched", () => {
    const csv = toHooksCsv([rec({ hook: "", captionStart: "From caption", reel: null, metrics: { plays: 5 } })]);
    expect(csv.trim().split("\n")[1]).toBe("From caption,5,,,,,,2026-11-18T18:00:10+0000,,");
  });
});
