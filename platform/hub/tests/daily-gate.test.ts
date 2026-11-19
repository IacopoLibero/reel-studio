import { describe, expect, it, vi } from "vitest";
import { checkConnectivity, gate, heavyActive, localParts, startDailyLoop, todayIn } from "../src/daily/gate.js";
import type { Job } from "../src/shared/types.js";

const TZ = "Europe/Rome";
const base = { enabled: true, earliest: "06:00", tz: TZ, hasPlanToday: false, heavyActive: false };

describe("time in Rome", () => {
  it("uses the local date and minutes, winter and summer", () => {
    expect(localParts(new Date("2026-11-20T04:59:00Z"), TZ)).toEqual({ date: "2026-11-20", minutes: 5 * 60 + 59 });
    expect(localParts(new Date("2026-07-01T04:00:00Z"), TZ)).toEqual({ date: "2026-07-01", minutes: 6 * 60 });
    expect(todayIn(new Date("2026-11-19T23:30:00Z"), TZ)).toBe("2026-11-20");
  });
});

describe("gate", () => {
  const at = (iso: string) => new Date(iso);
  it("is off by default behaviour: disabled never runs", () => {
    expect(gate({ ...base, now: at("2026-11-20T09:00:00Z"), enabled: false })).toMatchObject({ run: false, reason: "off" });
  });
  it("waits for the earliest time (06:00 Rome = 05:00 UTC in November)", () => {
    expect(gate({ ...base, now: at("2026-11-20T04:59:00Z") }).run).toBe(false);
    expect(gate({ ...base, now: at("2026-11-20T05:00:00Z") }).run).toBe(true);
  });
  it("runs at most once per day and waits for heavy jobs", () => {
    expect(gate({ ...base, now: at("2026-11-20T09:00:00Z"), hasPlanToday: true }).reason).toBe("already ran today");
    expect(gate({ ...base, now: at("2026-11-20T09:00:00Z"), heavyActive: true }).reason).toMatch(/heavy/);
  });
  it("honours a custom earliest time", () => {
    expect(gate({ ...base, earliest: "09:30", now: at("2026-11-20T08:00:00Z") }).run).toBe(false);
    expect(gate({ ...base, earliest: "09:30", now: at("2026-11-20T08:30:00Z") }).run).toBe(true);
  });
});

const j = (type: Job["type"], status: Job["status"]) => ({ type, status }) as Job;
describe("heavyActive", () => {
  it("counts running and queued heavy jobs only", () => {
    expect(heavyActive([j("reel.make", "running")])).toBe(true);
    expect(heavyActive([j("instagram.schedule", "queued")])).toBe(true);
    expect(heavyActive([j("reel.make", "done"), j("daily.run", "running")])).toBe(false);
  });
});

describe("connectivity", () => {
  it("needs every URL to answer, any status counts", async () => {
    const ok = vi.fn(async () => new Response(null, { status: 405 }));
    expect(await checkConnectivity(ok as unknown as typeof fetch)).toBe(true);
    expect(ok).toHaveBeenCalledTimes(2);
    const half = vi.fn(async (u: string | URL | Request) => { if (String(u).includes("anthropic")) throw new Error("down"); return new Response(null); });
    expect(await checkConnectivity(half as unknown as typeof fetch)).toBe(false);
  });
  it("is false when fetch itself throws", async () => {
    expect(await checkConnectivity((async () => { throw new Error("x"); }) as typeof fetch)).toBe(false);
  });
});

describe("trigger loop", () => {
  const make = (o: { now: Date; online?: boolean; heavy?: boolean; enabled?: boolean }) => {
    const state = { now: o.now, online: o.online ?? true, heavy: o.heavy ?? false, plans: new Set<string>(), triggered: [] as string[], checks: 0 };
    const loop = startDailyLoop({
      now: () => state.now, getDaily: () => ({ enabled: o.enabled ?? true, earliest: "06:00" }), timezone: () => TZ,
      hasPlan: (d) => state.plans.has(d), heavy: () => state.heavy,
      online: async () => { state.checks += 1; return state.online; },
      trigger: (d) => { state.plans.add(d); state.triggered.push(d); }, intervalMs: 1e9,
    });
    return { state, loop };
  };
  it("does not even check the network when it is too early, off or already ran", async () => {
    const early = make({ now: new Date("2026-11-20T04:00:00Z") });
    await early.loop.tick();
    const off = make({ now: new Date("2026-11-20T09:00:00Z"), enabled: false });
    await off.loop.tick();
    expect(early.state.checks + off.state.checks).toBe(0);
    early.loop.stop(); off.loop.stop();
  });
  it("runs on the first check after it is back online, once per day", async () => {
    const { state, loop } = make({ now: new Date("2026-11-20T09:00:00Z"), online: false });
    expect((await loop.tick()).reason).toBe("offline");
    state.online = true;
    expect((await loop.tick()).run).toBe(true);
    state.now = new Date("2026-11-20T15:00:00Z");
    expect((await loop.tick()).reason).toBe("already ran today");
    expect(state.triggered).toEqual(["2026-11-20"]);
    state.now = new Date("2026-11-21T05:10:00Z");
    expect((await loop.tick()).run).toBe(true);
    expect(state.triggered).toEqual(["2026-11-20", "2026-11-21"]);
    loop.stop();
  });
  it("waits while a heavy job runs and never starts two at once", async () => {
    const { state, loop } = make({ now: new Date("2026-11-20T09:00:00Z"), heavy: true });
    expect((await loop.tick()).run).toBe(false);
    state.heavy = false;
    const [a, b] = await Promise.all([loop.tick(), loop.tick()]);
    expect([a.run, b.run].filter(Boolean)).toHaveLength(1);
    expect(state.triggered).toHaveLength(1);
    loop.stop();
  });
  it("survives a trigger error and reports it", async () => {
    const log = vi.fn();
    const loop = startDailyLoop({ now: () => new Date("2026-11-20T09:00:00Z"), getDaily: () => ({ enabled: true, earliest: "06:00" }), timezone: () => TZ, hasPlan: () => false, heavy: () => false, online: async () => true, trigger: () => { throw new Error("disk full"); }, log, intervalMs: 1e9 });
    expect((await loop.tick()).reason).toBe("error");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("disk full"));
    loop.stop();
  });
});
