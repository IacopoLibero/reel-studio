import { describe, expect, it } from "vitest";
import { MIN_REELS, bestTimeStats, defaultsFromPattern, parseSuggestions } from "../src/calendar/best-times.js";
import { DEFAULT_PATTERN } from "../src/slots.js";
import type { MediaRecord, Snapshot } from "../src/analytics/schemas.js";

const media = (id: string, postedAt: string, plays: number | undefined, over: Partial<MediaRecord> = {}): MediaRecord => ({
  id, permalink: "", captionStart: "", hook: "", postedAt, mediaType: "VIDEO", productType: "REELS", reel: null,
  metrics: plays === undefined ? {} : { plays, reach: plays - 1, saves: 1 }, insights: plays === undefined ? "none" : "ok", skipped: [], ...over,
});
const snap = (m: MediaRecord[]): Snapshot => ({ version: 1, collectedAt: "2026-11-19T12:00:00.000Z", igUserId: "1", warnings: [], media: m });

describe("bestTimeStats", () => {
  it("says there is too little data under the minimum and still returns the pattern defaults", () => {
    const s = bestTimeStats(snap([media("a", "2026-11-10T17:00:00+0000", 100)]), "Europe/Rome", DEFAULT_PATTERN);
    expect(s.enough).toBe(false);
    expect(s.reelsUsed).toBe(1);
    expect(s.message).toMatch(/too little/i);
    expect(s.defaults).toEqual(defaultsFromPattern(DEFAULT_PATTERN));
  });
  it("counts only reels with plays, older than two days, and groups by local day and hour band", () => {
    const rows = Array.from({ length: MIN_REELS }, (_, i) => media(`r${i}`, `2026-11-${String(1 + i).padStart(2, "0")}T16:30:00+0000`, 100 + i));
    const withNoise = [...rows, media("new", "2026-11-19T07:00:00+0000", 5), media("none", "2026-11-02T10:00:00+0000", undefined), media("img", "2026-11-03T10:00:00+0000", 50, { productType: "FEED" })];
    const s = bestTimeStats(snap(withNoise), "Europe/Rome", DEFAULT_PATTERN);
    expect(s.enough).toBe(true);
    expect(s.reelsUsed).toBe(MIN_REELS);
    expect(s.byHour.every((b) => b.reels > 0)).toBe(true);
    expect(s.byHour.reduce((n, b) => n + b.reels, 0)).toBe(MIN_REELS);
    expect(s.byHour[0]?.avgPlays).toBeGreaterThanOrEqual(s.byHour.at(-1)?.avgPlays ?? 0);
    expect(s.byHour[0]?.hour).toBe("17");
  });
});

describe("parseSuggestions", () => {
  it("accepts a clean answer inside a code fence", () => {
    const r = parseSuggestions('```json\n{"basedOn":"9 reels","note":"n","suggestions":[{"day":"Tue","time":"17:30","why":"best plays"}]}\n```');
    expect(r).toEqual({ ok: true, value: { basedOn: "9 reels", note: "n", suggestions: [{ day: "Tue", time: "17:30", why: "best plays" }] } });
  });
  it("rejects a bad time and non-JSON", () => {
    expect(parseSuggestions('{"basedOn":"x","note":"","suggestions":[{"day":"Tue","time":"5pm","why":"w"}]}').ok).toBe(false);
    expect(parseSuggestions("sure!").ok).toBe(false);
  });
});

describe("defaultsFromPattern", () => {
  it("lists the times per weekday name", () => {
    expect(defaultsFromPattern(DEFAULT_PATTERN)[0]).toEqual({ day: "Sun", times: ["08:00", "16:30", "19:00"] });
    expect(defaultsFromPattern(DEFAULT_PATTERN)).toHaveLength(7);
  });
});
