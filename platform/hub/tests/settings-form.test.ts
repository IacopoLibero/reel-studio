import { describe, expect, it } from "vitest";
import type { Settings } from "../src/shared/types";
import { cleanTimes, daySummary, fromDraft, isDirty, isTime, postsPerWeek, toDraft, validate } from "../web/settings-form";

const base: Settings = {
  factory: { concurrency: 2, closingRules: { product: ["qr*", "menu"], general: ["allergen*"] } },
  daily: { enabled: false, earliest: "06:00", ideas: 3, threads: false },
  blenderDevice: "auto",
  claudeModel: "",
  terminalPermission: "ask",
  assistant: { kind: "claude", command: "" },
  accountName: "my_brand_account",
  slotPattern: {
    timezone: "Europe/Rome",
    days: [["08:00", "16:30", "19:00"], ["07:30", "17:30"], ["08:00", "16:30", "19:00"], ["07:30", "17:30"], ["08:00", "16:30", "19:00"], ["07:30", "17:30"], ["07:30", "17:30"]],
  },
} as Settings;

describe("settings form: assistant", () => {
  it("accepts claude and codex without any command", () => {
    const d = toDraft(base);
    expect(validate(d).assistant).toBeUndefined();
    expect(validate({ ...d, settings: { ...d.settings, assistant: { kind: "codex" } } }).assistant).toBeUndefined();
  });
});

describe("settings form", () => {
  it("accepts only HH:MM times", () => {
    expect(["07:30", "00:00", "23:59"].every(isTime)).toBe(true);
    expect(["7:30", "24:00", "12:60", "ab:cd", ""].some(isTime)).toBe(false);
  });

  it("cleans times: trims, drops invalid, removes duplicates and sorts", () => {
    expect(cleanTimes([" 17:30", "07:30", "07:30", "nope", "08:00"])).toEqual(["07:30", "08:00", "17:30"]);
  });

  it("round-trips an untouched draft to identical settings and reports it clean", () => {
    const d = toDraft(base);
    expect(fromDraft(d)).toEqual(base);
    expect(isDirty(base, d)).toBe(false);
  });

  it("does not mutate the saved settings when the draft changes", () => {
    const d = toDraft(base);
    d.days[0].push("21:00");
    d.settings.daily.earliest = "07:00";
    expect(base.slotPattern.days[0]).toHaveLength(3);
    expect(base.daily.earliest).toBe("06:00");
    expect(isDirty(base, d)).toBe(true);
  });

  it("detects a change only when the saved result would differ (order and blanks do not count)", () => {
    const d = toDraft(base);
    d.days[1] = ["17:30", "07:30", ""];
    d.product = ["qr*", "menu", "  "];
    expect(isDirty(base, d)).toBe(false);
  });

  it("builds the server object from the draft", () => {
    const d = toDraft(base);
    d.days[6] = ["18:00", "08:00"];
    d.general = [" tips ", ""];
    const out = fromDraft(d);
    expect(out.slotPattern.days[6]).toEqual(["08:00", "18:00"]);
    expect(out.factory.closingRules.general).toEqual(["tips"]);
  });

  it("validates fields with messages the user can act on", () => {
    expect(validate(toDraft(base))).toEqual({});
    const d = toDraft(base);
    d.days[2] = ["8:00"];
    d.settings.daily.earliest = "6am";
    d.settings.daily.ideas = 0;
    d.settings.factory.concurrency = 9;
    d.settings.slotPattern.timezone = "Mars/Olympus";
    const p = validate(d);
    expect(Object.keys(p).sort()).toEqual(["concurrency", "day2", "earliest", "ideas", "timezone"]);
    expect(p.day2).toContain("Tuesday");
    expect(p.day2).toContain("HH:MM");
  });

  it("summarises days and the week", () => {
    expect(daySummary(["07:30", "17:30"])).toBe("2 posts a day");
    expect(daySummary(["08:00"])).toBe("1 post a day");
    expect(daySummary([])).toBe("No posts");
    expect(postsPerWeek(base.slotPattern.days)).toBe(17);
  });
});
