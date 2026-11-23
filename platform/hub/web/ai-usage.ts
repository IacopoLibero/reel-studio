/** Pure helpers for showing how much of Claude's limits is used. Kept apart from the components so they can be tested. */
export const percent = (utilization: number): number => Math.max(0, Math.min(100, Math.round(utilization * 100)));

export type Level = "ok" | "warn" | "bad";
export const levelOf = (utilization: number): Level => (utilization >= 0.9 ? "bad" : utilization >= 0.7 ? "warn" : "ok");

/** "in 2 h 10 min", "in 25 min", "in 3 days", "now" for a reset time in unix seconds. */
export function resetsIn(resetsAt: number | null, nowMs: number): string {
  if (resetsAt === null) return "";
  const min = Math.round((resetsAt * 1000 - nowMs) / 60_000);
  if (min <= 0) return "now";
  if (min < 60) return `in ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `in ${h} h${min % 60 ? ` ${min % 60} min` : ""}`;
  const days = Math.round(h / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function ago(iso: string, nowMs: number): string {
  const min = Math.round((nowMs - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(min) || min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

export const dollars = (n: number): string => (n < 0.005 ? "$0" : n < 10 ? `$${n.toFixed(2)}` : `$${Math.round(n)}`);
