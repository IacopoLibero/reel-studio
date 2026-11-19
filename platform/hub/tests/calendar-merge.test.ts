import { describe, it, expect } from "vitest";
import { matchReel, toLocal, slotsInRange, buildCalendar, normalizeCaption, type ReelRef } from "../src/calendar/merge.js";
import { DEFAULT_PATTERN } from "../src/slots.js";
import type { Job } from "../src/shared/types.js";

const reels: ReelRef[] = [
  { key: "acme/21-six-languages-tourists", brand: "acme", folder: "21-six-languages-tourists", n: 21, name: "six-languages-tourists", firstLine: "Which 6 languages cover most of the tourists in Europe? 👇", closing: "B", hasCover: true },
  { key: "acme/9-wrong-price", brand: "acme", folder: "9-wrong-price", n: 9, name: "wrong-price", firstLine: "What happens when the price on your printed menu is wrong? 👇", closing: "A", hasCover: false },
];

describe("normalizeCaption", () => {
  it("lowercases, collapses spaces and drops ellipsis", () => {
    expect(normalizeCaption("  Hello   World… ")).toBe("hello world");
    expect(normalizeCaption("Hi...")).toBe("hi");
  });
});

describe("matchReel", () => {
  it("matches a truncated caption start", () => {
    expect(matchReel("Which 6 languages cover most of the…", reels)?.n).toBe(21);
    expect(matchReel("What happens when the price on your printed menu is wrong? 👇", reels)?.n).toBe(9);
  });
  it("returns null for no or too-short matches", () => {
    expect(matchReel("Something else entirely", reels)).toBeNull();
    expect(matchReel("Wh", reels)).toBeNull();
    expect(matchReel("", reels)).toBeNull();
  });
});

describe("toLocal", () => {
  it("converts an ISO instant to Rome date and time", () => {
    expect(toLocal("2026-11-20T16:30:00.000Z", "Europe/Rome")).toEqual({ date: "2026-11-20", time: "17:30" });
    expect(toLocal("2026-11-20T17:30:00+01:00", "Europe/Rome")).toEqual({ date: "2026-11-20", time: "17:30" });
    expect(toLocal("2026-07-20T23:30:00Z", "Europe/Rome")).toEqual({ date: "2026-07-21", time: "01:30" });
  });
});

describe("slotsInRange", () => {
  const now = new Date("2026-11-19T10:00:00Z"); // Thu 11:00 Rome
  it("lists the pattern slots in range, future only, marking taken ones", () => {
    const s = slotsInRange(DEFAULT_PATTERN, "2026-11-19", "2026-11-21", now, new Set(["2026-11-20 17:30"]));
    expect(s.map((x) => `${x.date} ${x.time}`)).toEqual(["2026-11-19 16:30", "2026-11-19 19:00", "2026-11-20 07:30", "2026-11-20 17:30", "2026-11-21 07:30", "2026-11-21 17:30"]);
    expect(s.find((x) => x.time === "17:30" && x.date === "2026-11-20")?.taken).toBe(true);
    expect(s.filter((x) => x.taken)).toHaveLength(1);
  });
  it("skips slots under 20 minutes ahead", () => {
    const s = slotsInRange(DEFAULT_PATTERN, "2026-11-19", "2026-11-19", new Date("2026-11-19T15:15:00Z"), new Set());
    expect(s.map((x) => x.time)).toEqual(["19:00"]);
  });
});

describe("buildCalendar", () => {
  const posts = [
    { id: "p1", scheduledAt: "2026-11-20T17:30:00+01:00", captionStart: "Which 6 languages cover most of the tourists in Europe?" },
    { id: "p2", scheduledAt: "2026-11-21T07:30:00+01:00", captionStart: "Unknown reel" },
  ];
  const job = (o: Partial<Job>): Job => ({ id: "j", type: "instagram.schedule", title: "t", status: "queued", progress: 0, step: "", steps: [], stepIndex: 0, log: [], params: {}, createdAt: "", startedAt: null, finishedAt: null, result: {}, error: null, ...o });

  it("merges Instagram posts with reel info", () => {
    const c = buildCalendar({ posts, reels, jobs: [], local: {}, pattern: DEFAULT_PATTERN, from: "2026-11-15", to: "2026-11-28", now: new Date("2026-11-19T10:00:00Z") });
    expect(c.posts).toHaveLength(2);
    expect(c.posts[0]).toMatchObject({ id: "p1", date: "2026-11-20", time: "17:30", status: "scheduled", reel: { n: 21, closing: "B" }, coverUrl: expect.stringContaining("acme%2F21") });
    expect(c.posts[1]).toMatchObject({ reel: null, coverUrl: null });
    expect(c.slots.find((s) => s.date === "2026-11-20" && s.time === "17:30")?.taken).toBe(true);
  });
  it("adds queued and running schedule jobs at their slot", () => {
    const j = job({ status: "running", params: { reel: "acme/9-wrong-price", date: "2026-11-22", time: "08:00" } });
    const c = buildCalendar({ posts: [], reels, jobs: [j], local: {}, pattern: DEFAULT_PATTERN, from: "2026-11-15", to: "2026-11-28", now: new Date("2026-11-19T10:00:00Z") });
    expect(c.posts).toHaveLength(1);
    expect(c.posts[0]).toMatchObject({ status: "running", jobId: "j", reel: { n: 9 }, time: "08:00" });
    expect(c.slots.find((s) => s.date === "2026-11-22" && s.time === "08:00")?.taken).toBe(true);
  });
  it("falls back on local records not seen on Instagram", () => {
    const c = buildCalendar({ posts: [], reels, jobs: [], local: { "acme/9-wrong-price": { at: "2026-11-23 07:30", status: "scheduled" } }, pattern: DEFAULT_PATTERN, from: "2026-11-15", to: "2026-11-28", now: new Date("2026-11-19T10:00:00Z") });
    expect(c.posts[0]).toMatchObject({ status: "local", reel: { n: 9 }, date: "2026-11-23" });
  });
  it("does not duplicate a local record already matched to a post", () => {
    const c = buildCalendar({ posts, reels, jobs: [], local: { "acme/21-six-languages-tourists": { at: "2026-11-20 17:30", status: "scheduled" } }, pattern: DEFAULT_PATTERN, from: "2026-11-15", to: "2026-11-28", now: new Date("2026-11-19T10:00:00Z") });
    expect(c.posts).toHaveLength(2);
  });
  it("marks posts busy while a reschedule or delete job is pending and drops posts outside the range", () => {
    const j = job({ type: "instagram.delete", status: "queued", params: { id: "p1" } });
    const c = buildCalendar({ posts: [...posts, { id: "p3", scheduledAt: "2027-02-01T10:00:00+01:00", captionStart: "far" }], reels, jobs: [j], local: {}, pattern: DEFAULT_PATTERN, from: "2026-11-15", to: "2026-11-28", now: new Date("2026-11-19T10:00:00Z") });
    expect(c.posts.find((p) => p.id === "p1")?.busy).toBe("Delete waiting");
    expect(c.posts.find((p) => p.id === "p3")).toBeUndefined();
  });
});
