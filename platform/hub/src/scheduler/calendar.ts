import { createHash } from 'node:crypto';
import { romeWallToInstant } from './slots.js';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const pad = (n: number) => String(n).padStart(2, '0');

export interface Ymd { year: number; month: number; day: number } // month 1-12

/** "7:00 AM" -> { hour24, minute }. 12 AM = 0, 12 PM = 12. */
export function parseTimeLabel(label: string): { hour24: number; minute: number } {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([AP])M\s*$/i.exec(label);
  if (!m) throw new Error(`Bad time label "${label}"`);
  const h = Number(m[1]);
  if (h < 1 || h > 12 || Number(m[2]) > 59) throw new Error(`Bad time label "${label}"`);
  const pm = m[3].toUpperCase() === 'P';
  return { hour24: (h % 12) + (pm ? 12 : 0), minute: Number(m[2]) };
}

/** Month/year(s) of a week title: "November 2026", "November – December 2026", "December 2026 – January 2027". */
export function parseWeekTitle(title: string): { firstMonth: number; firstYear: number } {
  const words = title.toLowerCase().match(/[a-z]+|\d{4}/g) ?? [];
  const months: number[] = [];
  const years: number[] = [];
  for (const w of words) {
    const i = MONTHS.findIndex((x) => x === w || (w.length >= 3 && x.startsWith(w)));
    if (/^\d{4}$/.test(w)) years.push(Number(w));
    else if (i >= 0) months.push(i + 1);
  }
  if (!months.length || !years.length) throw new Error(`Unreadable calendar title "${title}"`);
  const firstMonth = months[0];
  let firstYear = years[0];
  // "November – December 2026" has one year; "December – January 2027" starts the year before.
  if (years.length === 1 && months.length > 1 && months[0] > months[months.length - 1]) firstYear -= 1;
  return { firstMonth, firstYear };
}

/** Day numbers of the week headers ("Thu 19" -> 19) to full dates, rolling the month over. */
export function resolveWeekDates(title: string, dayNumbers: number[]): Ymd[] {
  let { firstMonth: month, firstYear: year } = parseWeekTitle(title);
  const out: Ymd[] = [];
  let prev = 0;
  for (const day of dayNumbers) {
    if (day < prev) {
      month += 1;
      if (month > 12) { month = 1; year += 1; }
    }
    out.push({ year, month, day });
    prev = day;
  }
  return out;
}

export function romeOffset(wall: string): string {
  const asUtc = Date.parse(`${wall}:00Z`);
  const min = Math.round((asUtc - romeWallToInstant(wall).getTime()) / 60000);
  const sign = min >= 0 ? '+' : '-';
  return `${sign}${pad(Math.floor(Math.abs(min) / 60))}:${pad(Math.abs(min) % 60)}`;
}

/** Rome wall "YYYY-MM-DDTHH:mm" -> ISO 8601 with the Europe/Rome offset. */
export function wallToIso(wall: string): string {
  return `${wall}:00${romeOffset(wall)}`;
}

export function toIso(d: Ymd, timeLabel: string): string {
  const { hour24, minute } = parseTimeLabel(timeLabel);
  return wallToIso(`${d.year}-${pad(d.month)}-${pad(d.day)}T${pad(hour24)}:${pad(minute)}`);
}

/** Rome wall "YYYY-MM-DDTHH:mm" of an ISO string (any offset). */
export function isoToWall(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) throw new Error(`Bad ISO date "${iso}"`);
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(t);
  const g = (k: string) => p.find((x) => x.type === k)!.value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}

export const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

export function captionStartOf(caption: string): string {
  return caption.trim().split('\n')[0].trim().slice(0, 60);
}

export function postId(captionStart: string, iso: string): string {
  return createHash('sha1').update(`${captionStart}\n${iso}`).digest('hex').slice(0, 12);
}

export interface RawPost { text: string; left: number; right: number }
export interface RawHeader { label: string; left: number; right: number }
export interface RawWeek { title: string; headers: RawHeader[]; posts: RawPost[] }
export interface ParsedPost { id: string; scheduledAt: string; captionStart: string }

/** Pure: turns the raw week read from the page into posts (column by horizontal overlap with the headers). */
export function parseWeek(raw: RawWeek): ParsedPost[] {
  const nums = raw.headers.map((h) => Number(/(\d+)$/.exec(h.label)![1]));
  const dates = resolveWeekDates(raw.title, nums);
  const out: ParsedPost[] = [];
  for (const p of raw.posts) {
    const mid = (p.left + p.right) / 2;
    const col = raw.headers.findIndex((h) => mid >= h.left && mid <= h.right);
    if (col < 0) continue;
    const lines = p.text.trim().split('\n');
    const time = lines[lines.length - 1].trim();
    const captionStart = captionStartOf(lines.slice(0, -1).join('\n'));
    const iso = toIso(dates[col], time);
    out.push({ id: postId(captionStart, iso), scheduledAt: iso, captionStart });
  }
  return out;
}
