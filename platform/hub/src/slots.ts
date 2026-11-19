import type { Slot, SlotPattern } from "./shared/types.js";

export const DEFAULT_PATTERN: SlotPattern = {
  timezone: "Europe/Rome",
  days: [
    ["08:00", "16:30", "19:00"], ["07:30", "17:30"], ["08:00", "16:30", "19:00"], ["07:30", "17:30"],
    ["08:00", "16:30", "19:00"], ["07:30", "17:30"], ["07:30", "17:30"],
  ],
};
export const MIN_LEAD_MINUTES = 20;

const partsIn = (d: Date, tz: string) => {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(d)) if (p.type !== "literal") o[p.type] = Number(p.value);
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number };
};

/** Wall-clock date and time in a time zone to a UTC instant. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [h, mi] = time.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const p = partsIn(new Date(guess), tz);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const first = guess - (asIfUtc - guess);
  const p2 = partsIn(new Date(first), tz);
  const off2 = Date.UTC(p2.year, p2.month - 1, p2.day, p2.hour, p2.minute, p2.second) - first;
  return new Date(guess - off2);
}

export function minutesAhead(date: string, time: string, tz: string, now: Date): number {
  return Math.round((zonedToUtc(date, time, tz).getTime() - now.getTime()) / 60000);
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

interface Opts { taken?: ReadonlySet<string>; minLead?: number }

/** The next `count` slots of the pattern, at least `minLead` minutes in the future. Keys of `taken` are "YYYY-MM-DD HH:MM". */
export function nextSlots(pattern: SlotPattern, now: Date, count: number, opts: Opts = {}): Slot[] {
  const lead = opts.minLead ?? MIN_LEAD_MINUTES;
  const today = partsIn(now, pattern.timezone);
  const out: Slot[] = [];
  for (let i = 0; i < 400 && out.length < count; i++) {
    const day = new Date(Date.UTC(today.year, today.month - 1, today.day + i));
    const dow = day.getUTCDay();
    const date = `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`;
    for (const time of [...(pattern.days[dow] ?? [])].sort()) {
      if (out.length >= count) break;
      const at = zonedToUtc(date, time, pattern.timezone);
      if ((at.getTime() - now.getTime()) / 60000 < lead) continue;
      out.push({
        date, time, iso: at.toISOString(), taken: opts.taken?.has(`${date} ${time}`) ?? false,
        label: `${DAY_NAMES[dow]} ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]} ${time}`,
      });
    }
  }
  return out;
}
