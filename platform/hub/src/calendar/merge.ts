import { addDays, dayOfWeek } from "../shared/calendar-grid.js";
import type { CalendarPost, CalendarReel, CalendarSlot, Job, ScheduleEntry, SlotPattern } from "../shared/types.js";
import { minutesAhead, MIN_LEAD_MINUTES, zonedToUtc } from "../slots.js";

export interface ReelRef extends CalendarReel { firstLine: string; hasCover: boolean }
export interface RawPost { id: string; scheduledAt: string; captionStart: string; thumbnail?: string }

export const normalizeCaption = (s: string): string => s.replace(/…|\.{3}/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** The reel whose caption first line starts like (or is started by) the caption text Instagram shows. */
export function matchReel(captionStart: string, reels: readonly ReelRef[]): ReelRef | null {
  const a = normalizeCaption(captionStart);
  if (a.length < 6) return null;
  return reels.find((r) => { const b = normalizeCaption(r.firstLine); return b.length >= 6 && (b.startsWith(a) || a.startsWith(b)); }) ?? null;
}

/** Wall-clock date and time of an instant in a time zone. */
export function toLocal(iso: string, tz: string): { date: string; time: string } {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(new Date(iso)).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** Slots of the pattern between two dates (inclusive), at least 20 minutes ahead; `taken` keys are "YYYY-MM-DD HH:MM". */
export function slotsInRange(pattern: SlotPattern, from: string, to: string, now: Date, taken: ReadonlySet<string>): CalendarSlot[] {
  const out: CalendarSlot[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const time of [...(pattern.days[dayOfWeek(d)] ?? [])].sort()) {
      if (minutesAhead(d, time, pattern.timezone, now) < MIN_LEAD_MINUTES) continue;
      out.push({ date: d, time, iso: zonedToUtc(d, time, pattern.timezone).toISOString(), taken: taken.has(`${d} ${time}`) });
    }
  }
  return out;
}

const refOf = (r: ReelRef | null): CalendarReel | null => (r ? { key: r.key, brand: r.brand, folder: r.folder, n: r.n, name: r.name, closing: r.closing } : null);
const coverOf = (r: ReelRef | null): string | null => (r?.hasCover ? `/api/brands/${r.brand}/reels/file?key=${encodeURIComponent(r.key)}&kind=cover` : null);
const BUSY_TYPES = new Set(["instagram.reschedule", "instagram.delete"]);
const active = (j: Job) => j.status === "queued" || j.status === "running";

export interface BuildInput {
  posts: readonly RawPost[];
  reels: readonly ReelRef[];
  jobs: readonly Job[];
  local: Readonly<Record<string, ScheduleEntry>>;
  pattern: SlotPattern;
  from: string;
  to: string;
  now: Date;
}

export function buildCalendar(i: BuildInput): { posts: CalendarPost[]; slots: CalendarSlot[] } {
  const tz = i.pattern.timezone;
  const inRange = (d: string) => d >= i.from && d <= i.to;
  const busyBy = new Map<string, string>();
  for (const j of i.jobs.filter((x) => BUSY_TYPES.has(x.type) && active(x))) {
    busyBy.set(String(j.params.id), `${j.type === "instagram.delete" ? "Delete" : "Reschedule"} ${j.status === "running" ? "running" : "waiting"}`);
  }
  const posts: CalendarPost[] = [];
  const seenReels = new Set<string>();
  for (const p of i.posts) {
    const { date, time } = toLocal(p.scheduledAt, tz);
    if (!inRange(date)) continue;
    const reel = matchReel(p.captionStart, i.reels);
    if (reel) seenReels.add(reel.key);
    posts.push({ id: p.id, scheduledAt: p.scheduledAt, date, time, captionStart: p.captionStart, status: "scheduled", reel: refOf(reel), coverUrl: coverOf(reel), busy: busyBy.get(p.id) ?? null });
  }
  for (const j of i.jobs.filter((x) => x.type === "instagram.schedule" && active(x))) {
    const date = String(j.params.date), time = String(j.params.time);
    const reel = i.reels.find((r) => r.key === j.params.reel) ?? null;
    if (!inRange(date) || (reel && seenReels.has(reel.key))) continue;
    if (reel) seenReels.add(reel.key);
    posts.push({ id: `job:${j.id}`, scheduledAt: `${date}T${time}`, date, time, captionStart: reel?.firstLine ?? "", status: j.status === "running" ? "running" : "queued", reel: refOf(reel), coverUrl: coverOf(reel), jobId: j.id, busy: null });
  }
  for (const [key, e] of Object.entries(i.local)) {
    const [date = "", time = ""] = e.at.split(" ");
    const reel = i.reels.find((r) => r.key === key) ?? null;
    if (!inRange(date) || seenReels.has(key)) continue;
    posts.push({ id: `local:${key}`, scheduledAt: `${date}T${time}`, date, time, captionStart: reel?.firstLine ?? "", status: "local", reel: refOf(reel), coverUrl: coverOf(reel), busy: null });
  }
  posts.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const taken = new Set(posts.map((p) => `${p.date} ${p.time}`));
  return { posts, slots: slotsInRange(i.pattern, i.from, i.to, i.now, taken) };
}
