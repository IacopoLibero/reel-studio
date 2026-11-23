import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseUsageLine, UsageStore } from "../src/claude/usage.js";

const limits = (five: number, seven: number, extra: Record<string, unknown> = {}) => JSON.stringify({ type: "rate_limit_event", rate_limit_info: { status: "allowed", rateLimitType: "overage", utilization: 0.83, unifiedWindows: { five_hour: { utilization: five, resetsAt: 1795401000, status: "allowed" }, seven_day: { utilization: seven, resetsAt: 1796083200, status: "allowed_warning" } }, ...extra } });
const result = (usd: unknown) => JSON.stringify({ type: "result", subtype: "success", total_cost_usd: usd, result: "ok" });

describe("parseUsageLine", () => {
  it("reads the session (five hours) and week (seven days) windows of a rate-limit event", () => {
    expect(parseUsageLine(limits(0.83, 0.47))).toEqual({ kind: "limits", session: { utilization: 0.83, resetsAt: 1795401000, status: "allowed" }, week: { utilization: 0.47, resetsAt: 1796083200, status: "allowed_warning" } });
  });
  it("falls back to a single window named by rateLimitType", () => {
    const line = JSON.stringify({ type: "rate_limit_event", rate_limit_info: { status: "allowed", rateLimitType: "seven_day", utilization: 0.2, resetsAt: 1796083200 } });
    expect(parseUsageLine(line)).toEqual({ kind: "limits", session: null, week: { utilization: 0.2, resetsAt: 1796083200, status: "allowed" } });
  });
  it("reads the cost of a result", () => {
    expect(parseUsageLine(result(0.0837))).toEqual({ kind: "cost", usd: 0.0837 });
  });
  it("ignores other lines, damaged JSON, a result without cost and odd numbers", () => {
    for (const l of ["", "not json", '{"type":"assistant"}', result(undefined), result("x"), result(-1), limits(2, 0.5).replace("2,", "null,"), "[1,2]"]) {
      const e = parseUsageLine(l);
      expect(e === null || e.kind === "limits").toBe(true);
      if (e?.kind === "limits") expect(e.session).toBeNull();
    }
  });
  it("clamps a utilization over 1 to 1", () => {
    const e = parseUsageLine(limits(1.4, 0.5));
    expect(e?.kind === "limits" && e.session?.utilization).toBe(1);
  });
});

describe("UsageStore", () => {
  let dir: string, file: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "usage-")); file = join(dir, "usage.json"); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const at = (iso: string) => () => new Date(iso);

  it("starts empty", () => {
    expect(new UsageStore(file).view()).toEqual({ limits: null, cost: { today: 0, week: 0, month: 0 } });
  });
  it("keeps the latest limits with the time they were read, and survives a restart", () => {
    const s = new UsageStore(file, at("2026-11-23T10:00:00Z"));
    expect(s.record(limits(0.5, 0.3))).toBe(true);
    s.record(limits(0.6, 0.31));
    const v = new UsageStore(file, at("2026-11-23T10:05:00Z")).view();
    expect(v.limits).toMatchObject({ session: { utilization: 0.6 }, week: { utilization: 0.31 }, updatedAt: "2026-11-23T10:00:00.000Z" });
  });
  it("a window that is missing in a later event keeps its earlier value", () => {
    const s = new UsageStore(file, at("2026-11-23T10:00:00Z"));
    s.record(limits(0.5, 0.3));
    s.record(JSON.stringify({ type: "rate_limit_event", rate_limit_info: { status: "allowed", rateLimitType: "five_hour", utilization: 0.9, resetsAt: 1795401000 } }));
    const v = s.view().limits!;
    expect(v.session?.utilization).toBe(0.9);
    expect(v.week?.utilization).toBe(0.3);
  });
  it("adds up the cost per day and reports today, the last seven days and the last thirty", () => {
    const day = (iso: string, usd: number) => new UsageStore(file, at(iso)).record(result(usd));
    day("2026-10-20T12:00:00Z", 100);
    day("2026-11-10T12:00:00Z", 10);
    day("2026-11-20T12:00:00Z", 2);
    day("2026-11-23T08:00:00Z", 1);
    day("2026-11-23T09:00:00Z", 0.5);
    const v = new UsageStore(file, at("2026-11-23T10:00:00Z")).view();
    expect(v.cost.today).toBeCloseTo(1.5);
    expect(v.cost.week).toBeCloseTo(3.5);
    expect(v.cost.month).toBeCloseTo(13.5);
  });
  it("forgets days older than 35 days in the file", () => {
    new UsageStore(file, at("2026-09-01T12:00:00Z")).record(result(5));
    new UsageStore(file, at("2026-11-23T12:00:00Z")).record(result(1));
    expect(Object.keys(JSON.parse(readFileSync(file, "utf8")).costByDay)).toEqual(["2026-11-23"]);
  });
  it("returns false for a line it does not use, and starts again from a damaged file", () => {
    writeFileSync(file, "{broken");
    const s = new UsageStore(file);
    expect(s.record('{"type":"assistant"}')).toBe(false);
    expect(s.view().limits).toBeNull();
    expect(s.record(result(1))).toBe(true);
  });
});
