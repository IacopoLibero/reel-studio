import { describe, it, expect } from "vitest";
import { rescheduleSchema, deleteSchema, calendarQuerySchema } from "../src/calendar/schemas.js";
import { buildCalendarJobSpec, CalendarJobError, type KnownPost } from "../src/calendar/jobs.js";
import { DEFAULT_SETTINGS } from "../src/settings.js";
import type { Job } from "../src/shared/types.js";

const NOW = new Date("2026-11-19T10:00:00Z");
const post: KnownPost = { id: "p1", scheduledAt: "2026-11-20T17:30:00+01:00", captionStart: "Which 6 languages", date: "2026-11-20", time: "17:30", reelKey: "acme/21-x", reelN: 21 };
const deps = (jobs: Job[] = [], others: KnownPost[] = []) => ({ settings: DEFAULT_SETTINGS, jobs, posts: [post, ...others], now: NOW });

describe("schemas", () => {
  it("accepts a valid reschedule and rejects bad input", () => {
    expect(rescheduleSchema.safeParse({ id: "p1", newAt: "2026-11-25T08:00:00+01:00" }).success).toBe(true);
    expect(rescheduleSchema.safeParse({ id: "p1", newAt: "tomorrow" }).success).toBe(false);
    expect(rescheduleSchema.safeParse({ id: "", newAt: "2026-11-25T08:00:00Z" }).success).toBe(false);
  });
  it("needs confirm: true to delete", () => {
    expect(deleteSchema.safeParse({ id: "p1", confirm: true }).success).toBe(true);
    expect(deleteSchema.safeParse({ id: "p1" }).success).toBe(false);
    expect(deleteSchema.safeParse({ id: "p1", confirm: false }).success).toBe(false);
  });
  it("coerces the calendar query", () => {
    expect(calendarQuerySchema.parse({ weeks: "6", fresh: "1" })).toEqual({ weeks: 6, fresh: true });
    expect(calendarQuerySchema.parse({})).toEqual({ weeks: 6, fresh: false });
    expect(calendarQuerySchema.safeParse({ weeks: "99" }).success).toBe(false);
  });
});

describe("buildCalendarJobSpec", () => {
  it("builds a reschedule spec", () => {
    const s = buildCalendarJobSpec({ kind: "reschedule", id: "p1", newAt: "2026-11-25T08:00:00+01:00" }, deps());
    expect(s.type).toBe("instagram.reschedule");
    expect(s.params).toMatchObject({ id: "p1", captionStart: "Which 6 languages", scheduledAt: post.scheduledAt, newAt: "2026-11-25T08:00:00+01:00", date: "2026-11-25", time: "08:00", reelKey: "acme/21-x" });
    expect(s.title).toContain("25");
  });
  it("builds a delete spec", () => {
    const s = buildCalendarJobSpec({ kind: "delete", id: "p1" }, deps());
    expect(s.type).toBe("instagram.delete");
    expect(s.params).toMatchObject({ id: "p1", captionStart: "Which 6 languages", reelKey: "acme/21-x" });
  });
  it("rejects unknown posts, too-soon times, taken slots and busy posts", () => {
    expect(() => buildCalendarJobSpec({ kind: "delete", id: "zzz" }, deps())).toThrow(CalendarJobError);
    expect(() => buildCalendarJobSpec({ kind: "reschedule", id: "p1", newAt: "2026-11-19T11:10:00+01:00" }, deps())).toThrow(/20 minutes/);
    const other: KnownPost = { ...post, id: "p2", date: "2026-11-25", time: "08:00", scheduledAt: "2026-11-25T08:00:00+01:00" };
    expect(() => buildCalendarJobSpec({ kind: "reschedule", id: "p1", newAt: "2026-11-25T08:00:00+01:00" }, deps([], [other]))).toThrow(/slot/);
    const busy = { id: "j", type: "instagram.delete", status: "queued", params: { id: "p1" } } as unknown as Job;
    expect(() => buildCalendarJobSpec({ kind: "delete", id: "p1" }, deps([busy]))).toThrow(/already/);
  });
  it("rejects a reschedule to the same time", () => {
    expect(() => buildCalendarJobSpec({ kind: "reschedule", id: "p1", newAt: post.scheduledAt }, deps())).toThrow(/same/);
  });
});
