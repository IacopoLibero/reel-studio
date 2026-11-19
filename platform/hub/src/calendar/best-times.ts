import { z } from "zod";
import type { Snapshot } from "../analytics/schemas.js";
import type { SlotPattern } from "../shared/types.js";
import { toLocal } from "./merge.js";

export const MIN_REELS = 8;
const MIN_AGE_MS = 2 * 24 * 3600 * 1000;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface HourStat { hour: string; reels: number; avgPlays: number; avgReach: number; avgSaves: number }
export interface DayStat { day: string; reels: number; avgPlays: number }
export interface TimeStats {
  enough: boolean; reelsUsed: number; message: string; byHour: HourStat[]; byDay: DayStat[];
  defaults: { day: string; times: string[] }[];
}

export const defaultsFromPattern = (p: SlotPattern): { day: string; times: string[] }[] => DAYS.map((day, i) => ({ day, times: [...(p.days[i] ?? [])].sort() }));

const avg = (xs: number[]): number => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
const dowOf = (date: string): number => new Date(`${date}T12:00:00Z`).getUTCDay();

/** Plays, reach and saves per local posting hour and weekday. Only reels with plays and at least two days old count (younger ones are still growing). */
export function bestTimeStats(snap: Snapshot, tz: string, pattern: SlotPattern): TimeStats {
  const cutoff = Date.parse(snap.collectedAt) - MIN_AGE_MS;
  const rows = snap.media
    .filter((m) => m.productType === "REELS" && typeof m.metrics.plays === "number" && Date.parse(m.postedAt) <= cutoff)
    .map((m) => ({ ...toLocal(new Date(m.postedAt).toISOString(), tz), plays: m.metrics.plays ?? 0, reach: m.metrics.reach ?? 0, saves: m.metrics.saves ?? 0 }));
  const hours = new Map<string, typeof rows>();
  const days = new Map<number, typeof rows>();
  for (const r of rows) {
    const h = r.time.slice(0, 2);
    hours.set(h, [...(hours.get(h) ?? []), r]);
    days.set(dowOf(r.date), [...(days.get(dowOf(r.date)) ?? []), r]);
  }
  const byHour = [...hours.entries()].map(([hour, rs]): HourStat => ({ hour, reels: rs.length, avgPlays: avg(rs.map((r) => r.plays)), avgReach: avg(rs.map((r) => r.reach)), avgSaves: avg(rs.map((r) => r.saves)) })).sort((a, b) => b.avgPlays - a.avgPlays);
  const byDay = [...days.entries()].map(([d, rs]): DayStat => ({ day: DAYS[d] as string, reels: rs.length, avgPlays: avg(rs.map((r) => r.plays)) })).sort((a, b) => b.avgPlays - a.avgPlays);
  const enough = rows.length >= MIN_REELS;
  return {
    enough, reelsUsed: rows.length, byHour, byDay, defaults: defaultsFromPattern(pattern),
    message: enough ? `Based on ${rows.length} reels with real plays.` : `Too little data: ${rows.length} reel${rows.length === 1 ? "" : "s"} with plays at least two days old, at least ${MIN_REELS} are needed. These are the times of your slot pattern, not a result of your data.`,
  };
}

export const suggestionsSchema = z.object({
  basedOn: z.string().max(300),
  note: z.string().max(800).default(""),
  suggestions: z.array(z.object({
    day: z.string().max(40), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time must look like 17:30"), why: z.string().max(300),
  })).min(1).max(10),
});
export type Suggestions = z.infer<typeof suggestionsSchema>;

export function parseSuggestions(text: string): { ok: true; value: Suggestions } | { ok: false; error: string } {
  const t = text.trim();
  for (const c of [t, /```(?:json)?\s*([\s\S]*?)```/i.exec(t)?.[1], t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)]) {
    if (!c) continue;
    let raw: unknown;
    try { raw = JSON.parse(c.trim()); } catch { continue; }
    const r = suggestionsSchema.safeParse(raw);
    return r.success ? { ok: true, value: r.data } : { ok: false, error: `The suggestions had the wrong shape: ${r.error.issues[0]?.path.join(".") ?? ""} ${r.error.issues[0]?.message ?? ""}`.trim() };
  }
  return { ok: false, error: `Claude's answer was not valid JSON. Start: ${t.slice(0, 160) || "(empty)"}` };
}
