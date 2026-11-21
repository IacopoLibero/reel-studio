import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectInto, type ToolRunner } from "../src/analytics/collector.js";
import { snapshotSchema } from "../src/analytics/schemas.js";
import { latestSnapshot, listSnapshotDates, readSnapshot } from "../src/analytics/store.js";

const fx = (n: string): unknown => JSON.parse(readFileSync(join(import.meta.dirname, "fixtures/analytics", n), "utf8"));
let tmp: string, root: string, data: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "an-"));
  root = join(tmp, "root"); data = join(tmp, "data");
  mkdirSync(join(root, "brand/acme/reels/4-google-reviews"), { recursive: true });
  mkdirSync(data);
  writeFileSync(join(root, "brand/acme/reels/4-google-reviews/caption.md"), "Want more Google reviews for your restaurant? Here's what actually works 👇\n\nrest");
  writeFileSync(join(data, "reel-questions.md"), "## Done\n\n- [x] Want more Google reviews for your restaurant? · hook: proof · `4-google-reviews` · closing A · source: x\n");
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const NOW = new Date("2026-11-19T12:00:00Z");
const opts = () => ({ root, brand: "acme", dataDir: data, igUserId: "42", timezone: "Europe/Rome", now: NOW });

/** A runner that answers the list once and insights with the real recorded shapes. */
const runner = (calls: string[], over: Partial<Record<string, unknown>> = {}): ToolRunner => async (slug, args) => {
  calls.push(`${slug}:${JSON.stringify(args.metric ?? args.limit)}`);
  if (slug === "INSTAGRAM_GET_IG_USER_MEDIA") return fx("media-list.json");
  const metrics = args.metric as string[];
  if (args.ig_media_id === "m2" && metrics.length > 1) return { successful: false, error: "Media insights are not available yet for this media" };
  if (metrics.includes("reels_skip_rate") && args.ig_media_id === "m3") return fx("insights-unsupported.json");
  if (metrics.length === 1) {
    if (metrics[0] === "ig_reels_avg_watch_time" && args.ig_media_id === "m3") return fx("insights-unsupported.json");
    return { successful: true, data: { data: [{ name: metrics[0], values: [{ value: 7 }] }] } };
  }
  return over[String(args.ig_media_id)] ?? fx("insights-reel.json");
};

describe("collectInto", () => {
  it("writes a valid snapshot and the hooks csv, matched to the reel folder", async () => {
    const calls: string[] = [];
    const out = await collectInto(runner(calls), opts());
    expect(out.mediaCount).toBe(4);
    expect(out.snapshotPath).toBe(join(data, "analytics", "2026-11-19.json"));
    expect(out.csvPath).toBe(join(data, "analytics", "hooks.csv"));
    const snap = snapshotSchema.parse(JSON.parse(readFileSync(out.snapshotPath, "utf8")));
    const m1 = snap.media.find((m) => m.id === "m1");
    expect(m1?.reel).toMatchObject({ key: "acme/4-google-reviews", n: 4, closing: "A" });
    expect(m1?.hook).toBe("Want more Google reviews for your restaurant?");
    expect(m1?.metrics).toMatchObject({ plays: 58, reach: 51, avgWatchMs: 4734 });
    expect(m1?.insights).toBe("ok");
    expect(readFileSync(out.csvPath, "utf8").split("\n")[1]).toContain("Want more Google reviews for your restaurant?,58,51,0,0,1,0,");
  });

  it("asks insights only for reels and never calls anything but the two GET tools", async () => {
    const calls: string[] = [];
    await collectInto(runner(calls), opts());
    const slugs = new Set(calls.map((c) => c.split(":")[0]));
    expect([...slugs].sort()).toEqual(["INSTAGRAM_GET_IG_MEDIA_INSIGHTS", "INSTAGRAM_GET_IG_USER_MEDIA"]);
    expect(calls.filter((c) => c.startsWith("INSTAGRAM_GET_IG_MEDIA_INSIGHTS")).length).toBeGreaterThanOrEqual(3);
  });

  it("skips an unsupported metric and keeps the others (per-metric fallback)", async () => {
    const out = await collectInto(runner([]), opts());
    const m3 = snapshotSchema.parse(JSON.parse(readFileSync(out.snapshotPath, "utf8"))).media.find((m) => m.id === "m3");
    expect(m3?.skipped).toContain("ig_reels_avg_watch_time");
    expect(m3?.metrics.plays).toBe(7);
    expect(m3?.metrics.avgWatchMs).toBeUndefined();
    expect(m3?.insights).toBe("partial");
  });

  it("marks a post whose insights are not available yet and falls back to the list counts", async () => {
    const out = await collectInto(runner([]), opts());
    const m2 = snapshotSchema.parse(JSON.parse(readFileSync(out.snapshotPath, "utf8"))).media.find((m) => m.id === "m2");
    expect(m2?.insights).toBe("too_early");
    expect(m2?.metrics.likes).toBe(2);
    expect(m2?.metrics.plays).toBeUndefined();
  });

  it("fails clearly when the first call says the connection is invalid", async () => {
    const bad: ToolRunner = async () => ({ successful: false, error: "Connected account is expired" });
    await expect(collectInto(bad, opts())).rejects.toThrow(/composio link instagram/);
    expect(existsSync(join(data, "analytics"))).toBe(false);
  });

  it("stops at a rate limit but still writes what it has", async () => {
    let n = 0;
    const limited: ToolRunner = async (slug) => {
      if (slug === "INSTAGRAM_GET_IG_USER_MEDIA") return fx("media-list.json");
      n += 1;
      if (n > 1) return { successful: false, data: { status_code: 429 }, error: "Too many calls" };
      return fx("insights-reel.json");
    };
    const out = await collectInto(limited, opts());
    const snap = snapshotSchema.parse(JSON.parse(readFileSync(out.snapshotPath, "utf8")));
    expect(snap.warnings.join(" ")).toMatch(/rate limit/i);
    expect(snap.media.filter((m) => m.insights === "ok")).toHaveLength(1);
  });

  it("reads back through the store", async () => {
    await collectInto(runner([]), opts());
    expect(listSnapshotDates(data)).toEqual(["2026-11-19"]);
    expect(readSnapshot(data, "2026-11-19")?.media).toHaveLength(4);
    expect(latestSnapshot(data)?.collectedAt).toBe(NOW.toISOString());
    expect(readSnapshot(data, "../etc")).toBeNull();
    expect(readdirSync(join(data, "analytics")).sort()).toEqual(["2026-11-19.json", "hooks.csv"]);
  });
});
