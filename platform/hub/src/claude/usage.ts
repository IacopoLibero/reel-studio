import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** One limit window of a Claude subscription: how much is used (0 to 1), when it resets (unix seconds) and Claude's own status word. */
export interface Window { utilization: number; resetsAt: number | null; status: string }
export type UsageEvent = { kind: "limits"; session: Window | null; week: Window | null } | { kind: "cost"; usd: number };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);

function windowOf(v: unknown): Window | null {
  const o = obj(v);
  if (!o || typeof o.utilization !== "number" || !Number.isFinite(o.utilization) || o.utilization < 0) return null;
  return { utilization: Math.min(1, o.utilization), resetsAt: typeof o.resetsAt === "number" ? o.resetsAt : null, status: typeof o.status === "string" ? o.status : "" };
}

/**
 * What a line of Claude's stream-json output says about usage: a `rate_limit_event` (the session window of five hours and the week window of seven days,
 * which only a subscription has) or the cost of a finished `result`. Anything else is null.
 */
export function parseUsageLine(line: string): UsageEvent | null {
  if (!line.includes("rate_limit_event") && !line.includes("total_cost_usd")) return null;
  let o: Obj | null;
  try { o = obj(JSON.parse(line)); } catch { return null; }
  if (!o) return null;
  if (o.type === "rate_limit_event") {
    const info = obj(o.rate_limit_info);
    if (!info) return null;
    const windows = obj(info.unifiedWindows);
    let session = windowOf(windows?.five_hour), week = windowOf(windows?.seven_day);
    if (!session && !week) {
      const one = windowOf(info);
      if (info.rateLimitType === "five_hour") session = one; else if (info.rateLimitType === "seven_day") week = one;
    }
    return session || week ? { kind: "limits", session, week } : null;
  }
  if (o.type === "result" && typeof o.total_cost_usd === "number" && Number.isFinite(o.total_cost_usd) && o.total_cost_usd >= 0) return { kind: "cost", usd: o.total_cost_usd };
  return null;
}

interface Saved { limits: { session: Window | null; week: Window | null; updatedAt: string } | null; costByDay: Record<string, number> }
export interface UsageView {
  limits: { session: Window | null; week: Window | null; updatedAt: string } | null;
  /** What the jobs cost in dollars (the price at API rates; on a subscription it is not charged). */
  cost: { today: number; week: number; month: number };
}

const KEEP_DAYS = 35;
const dayOf = (d: Date): string => d.toISOString().slice(0, 10);
const daysAgo = (d: Date, n: number): string => dayOf(new Date(d.getTime() - n * 86_400_000));

/** The latest limits and the daily cost of Claude jobs, kept in one small file. Fed by `record` with the lines of every Claude run. */
export class UsageStore {
  constructor(private readonly file: string, private readonly now: () => Date = () => new Date()) {}

  private read(): Saved {
    try {
      const raw = obj(JSON.parse(readFileSync(this.file, "utf8")));
      const l = obj(raw?.limits);
      const costs = obj(raw?.costByDay) ?? {};
      return {
        limits: l && typeof l.updatedAt === "string" ? { session: windowOf(l.session), week: windowOf(l.week), updatedAt: l.updatedAt } : null,
        costByDay: Object.fromEntries(Object.entries(costs).filter(([, v]) => typeof v === "number" && Number.isFinite(v)) as [string, number][]),
      };
    } catch { return { limits: null, costByDay: {} }; }
  }

  private write(s: Saved): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(s)}\n`);
    renameSync(tmp, this.file);
  }

  /** Takes one line of Claude's output. Returns true when it carried usage information. */
  record(line: string): boolean {
    const e = parseUsageLine(line);
    if (!e) return false;
    const s = this.read(), now = this.now();
    if (e.kind === "limits") {
      s.limits = { session: e.session ?? s.limits?.session ?? null, week: e.week ?? s.limits?.week ?? null, updatedAt: now.toISOString() };
    } else {
      const today = dayOf(now);
      s.costByDay[today] = (s.costByDay[today] ?? 0) + e.usd;
      const oldest = daysAgo(now, KEEP_DAYS);
      for (const d of Object.keys(s.costByDay)) if (d < oldest) delete s.costByDay[d];
    }
    this.write(s);
    return true;
  }

  view(): UsageView {
    const s = this.read(), now = this.now();
    const since = (n: number): number => Object.entries(s.costByDay).filter(([d]) => d > daysAgo(now, n)).reduce((a, [, v]) => a + v, 0);
    return { limits: s.limits, cost: { today: s.costByDay[dayOf(now)] ?? 0, week: since(7), month: since(30) } };
  }
}
