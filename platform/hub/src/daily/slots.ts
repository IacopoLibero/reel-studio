import { nextSlots } from "../slots.js";
import type { Slot, SlotPattern } from "../shared/types.js";

export interface SlotSuggestion { slots: Slot[]; recommended: Slot | null; bestTimeNote: string | null }

const HHMM = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Reads "Tue 17:30" or "17:30" from a best-time line into a weekday (or null for any) and a time. */
export function parseBestTime(line: string): { dow: number | null; time: string } | null {
  const m = HHMM.exec(line);
  if (!m) return null;
  const d = DAYS.findIndex((x) => new RegExp(`\\b${x}`, "i").test(line));
  return { dow: d >= 0 ? d : null, time: `${(m[1] as string).padStart(2, "0")}:${m[2]}` };
}

const dowOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** The next free slots of the pattern; the recommendation is the first free slot that matches a best-time line, else the first free one. */
export function suggestSlots(pattern: SlotPattern, now: Date, taken: ReadonlySet<string>, bestTimes: readonly string[], count = 14): SlotSuggestion {
  const slots = nextSlots(pattern, now, count, { taken });
  const free = slots.filter((s) => !s.taken);
  const best = bestTimes.map(parseBestTime).filter((b): b is NonNullable<typeof b> => b !== null);
  const match = free.find((s) => best.some((b) => b.time === s.time && (b.dow === null || b.dow === dowOf(s.date))));
  const recommended = match ?? free[0] ?? null;
  return { slots, recommended, bestTimeNote: match ? `Matches your best time (${bestTimes.find((l) => parseBestTime(l)?.time === match.time) ?? match.time}).` : best.length ? "No free slot matches your best times; showing the next free slot of your pattern." : null };
}

/** Slots already used by scheduled reels and by schedule jobs in the queue, as "YYYY-MM-DD HH:MM". */
export const takenKeys = (...lists: readonly (readonly string[])[]): Set<string> => new Set(lists.flat());
