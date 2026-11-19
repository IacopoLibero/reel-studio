/** Pure date helpers on "YYYY-MM-DD" strings (no time zones involved). Weeks start on Sunday, like the slot pattern. */
const toUtc = (d: string): Date => { const [y, m, day] = d.split("-").map(Number) as [number, number, number]; return new Date(Date.UTC(y, m - 1, day)); };
const fmt = (d: Date): string => d.toISOString().slice(0, 10);

export const addDays = (d: string, n: number): string => fmt(new Date(toUtc(d).getTime() + n * 86_400_000));
export const dayOfWeek = (d: string): number => toUtc(d).getUTCDay();

export const weekOf = (d: string): string[] => {
  const start = addDays(d, -dayOfWeek(d));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
};

/** Whole weeks (Sunday first) covering the month of `d`. */
export function monthGrid(d: string): string[][] {
  const first = `${d.slice(0, 7)}-01`;
  const next = toUtc(first);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const last = addDays(fmt(next), -1);
  const weeks: string[][] = [];
  for (let cur = weekOf(first)[0] as string; cur <= weekOf(last)[6]!; cur = addDays(cur, 7)) weeks.push(weekOf(cur));
  return weeks;
}

export function rangeFor(view: "week" | "month", d: string): { from: string; to: string } {
  const days = view === "week" ? weekOf(d) : monthGrid(d).flat();
  return { from: days[0] as string, to: days[days.length - 1] as string };
}

export function groupByDay<T extends { date: string; time: string }>(items: readonly T[]): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const it of [...items].sort((a, b) => a.time.localeCompare(b.time))) (out[it.date] ??= []).push(it);
  return out;
}
