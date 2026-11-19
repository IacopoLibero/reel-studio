import type { Job } from "../shared/types.js";

export interface GateInput {
  now: Date; enabled: boolean; earliest: string; tz: string;
  hasPlanToday: boolean; heavyActive: boolean;
}
export interface GateDecision { run: boolean; reason: string }

export function localParts(now: Date, tz: string): { date: string; minutes: number } {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(now)) if (p.type !== "literal") o[p.type] = p.value;
  return { date: `${o.year}-${o.month}-${o.day}`, minutes: Number(o.hour) * 60 + Number(o.minute) };
}

export const todayIn = (now: Date, tz: string): string => localParts(now, tz).date;

const toMinutes = (hhmm: string): number => { const [h = 0, m = 0] = hhmm.split(":").map(Number); return h * 60 + m; };

/** Everything except connectivity, which costs network calls and is checked only when this says go. */
export function gate(i: GateInput): GateDecision {
  if (!i.enabled) return { run: false, reason: "off" };
  const { minutes } = localParts(i.now, i.tz);
  if (minutes < toMinutes(i.earliest)) return { run: false, reason: "too early" };
  if (i.hasPlanToday) return { run: false, reason: "already ran today" };
  if (i.heavyActive) return { run: false, reason: "another heavy job is running" };
  return { run: true, reason: "go" };
}

const HEAVY = new Set(["reel.make", "blender.render", "claude.task", "voice.generate", "instagram.schedule", "instagram.reschedule", "instagram.delete", "reel.ideas", "reel.insights", "series.plan"]);
export const heavyActive = (jobs: readonly Job[]): boolean => jobs.some((j) => (j.status === "running" || j.status === "queued") && HEAVY.has(j.type));

export const CHECK_URLS = ["https://www.instagram.com", "https://api.anthropic.com"] as const;

/** True when every URL answers at all (any HTTP status): the point is that the network path works. */
export async function checkConnectivity(fetchFn: typeof fetch = fetch, urls: readonly string[] = CHECK_URLS, timeoutMs = 8000): Promise<boolean> {
  try {
    const results = await Promise.all(urls.map((u) => fetchFn(u, { method: "HEAD", signal: AbortSignal.timeout(timeoutMs), redirect: "manual" }).then(() => true, () => false)));
    return results.every(Boolean);
  } catch { return false; }
}

export interface LoopDeps {
  now: () => Date;
  getDaily: () => { enabled: boolean; earliest: string };
  timezone: () => string;
  hasPlan: (date: string) => boolean;
  heavy: () => boolean;
  online: () => Promise<boolean>;
  trigger: (date: string) => void | Promise<void>;
  log?: (msg: string) => void;
  intervalMs?: number;
}

/** The hub-side trigger loop. `tick` is exposed so tests drive it with an injected clock. */
export function startDailyLoop(d: LoopDeps): { tick: () => Promise<GateDecision>; stop: () => void } {
  let inFlight = false;
  const tick = async (): Promise<GateDecision> => {
    if (inFlight) return { run: false, reason: "busy" };
    inFlight = true;
    try {
      const now = d.now();
      const tz = d.timezone();
      const date = todayIn(now, tz);
      const cfg = d.getDaily();
      const g = gate({ now, enabled: cfg.enabled, earliest: cfg.earliest, tz, hasPlanToday: d.hasPlan(date), heavyActive: d.heavy() });
      if (!g.run) return g;
      if (!(await d.online())) return { run: false, reason: "offline" };
      if (d.hasPlan(date)) return { run: false, reason: "already ran today" };
      await d.trigger(date);
      d.log?.(`daily run started for ${date}`);
      return g;
    } catch (e) {
      d.log?.(`daily loop error: ${(e as Error).message}`);
      return { run: false, reason: "error" };
    } finally { inFlight = false; }
  };
  const timer = setInterval(() => void tick(), d.intervalMs ?? 5 * 60_000);
  timer.unref();
  return { tick, stop: () => clearInterval(timer) };
}
