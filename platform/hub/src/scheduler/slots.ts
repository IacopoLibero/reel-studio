export const TIME_ZONE = 'Europe/Rome';
export const MIN_LEAD_MINUTES = 20;

const BIG_DAYS = new Set([0, 2, 4]); // Sun, Tue, Thu
const BIG_TIMES = ['08:00', '16:30', '19:00'];
const SMALL_TIMES = ['07:30', '17:30'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Day of week (0 = Sunday) of a "YYYY-MM-DD" calendar date. */
export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function slotTimesFor(date: string): string[] {
  return BIG_DAYS.has(dayOfWeek(date)) ? BIG_TIMES : SMALL_TIMES;
}

/** Europe/Rome wall time of an instant, "YYYY-MM-DDTHH:mm". */
export function romeWallTime(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}

/** Instant of a Europe/Rome wall time "YYYY-MM-DDTHH:mm". */
export function romeWallToInstant(wall: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(wall);
  if (!m) throw new Error(`Bad slot "${wall}", expected YYYY-MM-DDTHH:mm`);
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let guess = asUtc;
  for (let i = 0; i < 3; i++) {
    const seen = romeWallTime(new Date(guess));
    const sm = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(seen)!;
    const seenUtc = Date.UTC(+sm[1], +sm[2] - 1, +sm[3], +sm[4], +sm[5]);
    guess += asUtc - seenUtc;
  }
  return new Date(guess);
}

export function isValidSlotFormat(slot: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(slot);
}

export function minutesAhead(slot: string, now: Date): number {
  return (romeWallToInstant(slot).getTime() - now.getTime()) / 60000;
}

/**
 * Next `count` free slots after `now` (at least `lead` minutes ahead, not in `used`).
 * Returned as Rome wall times, in chronological order.
 */
export function nextFreeSlots(
  used: Iterable<string>, count: number, now: Date = new Date(), lead = MIN_LEAD_MINUTES,
): string[] {
  const taken = new Set(used);
  const out: string[] = [];
  let day = romeWallTime(now).slice(0, 10);
  for (let i = 0; i < 800 && out.length < count; i++, day = addDays(day, 1)) {
    for (const t of slotTimesFor(day)) {
      const slot = `${day}T${t}`;
      if (!taken.has(slot) && minutesAhead(slot, now) >= lead) {
        out.push(slot);
        if (out.length === count) break;
      }
    }
  }
  return out;
}
