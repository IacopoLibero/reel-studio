import type { Settings } from "../src/shared/types";

/** Draft of the Settings form: the lists are kept as arrays so the page can edit them without string juggling. */
export interface SettingsDraft {
  settings: Settings;
  days: string[][];
  product: string[];
  general: string[];
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isTime = (t: string): boolean => TIME.test(t);

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function toDraft(s: Settings): SettingsDraft {
  return {
    settings: clone(s),
    days: s.slotPattern.days.map((d) => [...d]),
    product: [...s.factory.closingRules.product],
    general: [...s.factory.closingRules.general],
  };
}

/** Sorted, de-duplicated list of valid HH:MM times; invalid entries are dropped. */
export function cleanTimes(times: readonly string[]): string[] {
  return [...new Set(times.map((t) => t.trim()).filter(isTime))].sort();
}

/** The Settings object the server expects, built from the draft (never mutates the draft). */
export function fromDraft(d: SettingsDraft): Settings {
  return {
    ...d.settings,
    slotPattern: { ...d.settings.slotPattern, days: d.days.map(cleanTimes) },
    factory: {
      ...d.settings.factory,
      closingRules: {
        product: d.product.map((x) => x.trim()).filter(Boolean),
        general: d.general.map((x) => x.trim()).filter(Boolean),
      },
    },
  };
}

export type Problems = Readonly<Record<string, string>>;

/** Field-level problems keyed by a stable name; an empty object means the draft can be saved. */
export function validate(d: SettingsDraft): Problems {
  const p: Record<string, string> = {};
  if (!d.settings.slotPattern.timezone.trim()) p.timezone = "Enter a time zone, for example Europe/Rome.";
  else {
    try { new Intl.DateTimeFormat("en", { timeZone: d.settings.slotPattern.timezone.trim() }); } catch { p.timezone = "Unknown time zone. Use a name such as Europe/Rome."; }
  }
  d.days.forEach((times, i) => {
    const bad = times.filter((t) => t.trim() !== "" && !isTime(t.trim()));
    if (bad.length) p[`day${i}`] = `${DAY_NAMES[i]}: "${bad[0]}" is not a time. Use HH:MM, for example 07:30.`;
  });
  if (!isTime(d.settings.daily.earliest.trim())) p.earliest = "Use HH:MM, for example 06:00.";
  const ideas = d.settings.daily.ideas;
  if (!Number.isInteger(ideas) || ideas < 1 || ideas > 10) p.ideas = "Choose a whole number from 1 to 10.";
  const c = d.settings.factory.concurrency;
  if (!Number.isInteger(c) || c < 1 || c > 6) p.concurrency = "Choose a whole number from 1 to 6.";
  if (d.settings.assistant.kind === "custom" && !d.settings.assistant.command.trim()) p.assistant = "Type the command for the custom assistant.";
  return p;
}

/** True when the draft would save something different from what the server holds. */
export function isDirty(saved: Settings, d: SettingsDraft): boolean {
  return JSON.stringify(fromDraft(toDraft(saved))) !== JSON.stringify(fromDraft(d));
}

/** "3 posts · 08:00, 16:30, 19:00" style summary for a day. */
export function daySummary(times: readonly string[]): string {
  const t = cleanTimes(times);
  if (!t.length) return "No posts";
  return `${t.length} ${t.length === 1 ? "post" : "posts"} a day`;
}

/** Posts per week from the pattern. */
export function postsPerWeek(days: readonly (readonly string[])[]): number {
  return days.reduce((n, d) => n + cleanTimes(d).length, 0);
}
