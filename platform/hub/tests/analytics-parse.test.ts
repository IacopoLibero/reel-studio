import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyFailure, parseInsights, parseMediaPage, unsupportedMetric } from "../src/analytics/parse.js";
import { cleanHook, matchMedia } from "../src/analytics/match.js";
import type { ReelRef } from "../src/calendar/merge.js";

const fx = (n: string): unknown => JSON.parse(readFileSync(join(import.meta.dirname, "fixtures/analytics", n), "utf8"));

describe("parseMediaPage", () => {
  it("reads the media of a real response and the cursor", () => {
    const page = parseMediaPage(fx("media-list.json"));
    expect(page.media).toHaveLength(4);
    expect(page.media[0]).toMatchObject({ id: "m1", productType: "REELS", mediaType: "VIDEO", likes: 1, comments: 0 });
    expect(page.media[3]?.productType).toBe("FEED");
    expect(page.after).toBe("cursor-x");
  });
  it("throws a connection error with the fix when the account is not linked", () => {
    expect(() => parseMediaPage({ successful: false, error: "No connected account found for toolkit instagram" })).toThrowError(/composio link instagram/);
  });
  it("throws the message of a generic failure", () => {
    expect(() => parseMediaPage({ successful: false, error: "boom" })).toThrowError(/boom/);
  });
  it("tolerates missing optional fields", () => {
    const page = parseMediaPage({ successful: true, data: { data: [{ id: "x", timestamp: "2026-01-01T00:00:00+0000" }] } });
    expect(page.media[0]).toMatchObject({ id: "x", caption: "", productType: "UNKNOWN", likes: null });
    expect(page.after).toBeNull();
  });
});

describe("parseInsights", () => {
  it("maps the Graph names to our metrics", () => {
    expect(parseInsights(fx("insights-reel.json"))).toEqual({
      reach: 51, likes: 1, comments: 0, saves: 0, shares: 0, interactions: 1, plays: 58, avgWatchMs: 4734, totalWatchMs: 260390, skipRate: 68.5,
    });
  });
  it("ignores unknown names and non-numeric values", () => {
    const r = parseInsights({ successful: true, data: { data: [{ name: "weird", values: [{ value: 3 }] }, { name: "reach", values: [{ value: "n/a" }] }, { name: "views", values: [{ value: 9 }] }] } });
    expect(r).toEqual({ plays: 9 });
  });
});

describe("error classes", () => {
  it("recognises an unsupported metric and names it", () => {
    const e = classifyFailure(fx("insights-unsupported.json"));
    expect(e.kind).toBe("unsupported");
    expect(unsupportedMetric(e.message)).toBe("ig_reels_avg_watch_time");
  });
  it("recognises not-yet-available insights", () => {
    expect(classifyFailure({ successful: false, error: "Media insights are not available yet for this media" }).kind).toBe("too_early");
  });
  it("recognises a broken connection", () => {
    expect(classifyFailure({ successful: false, error: "Connected account is expired, reconnect" }).kind).toBe("connection");
  });
  it("recognises a rate limit", () => {
    expect(classifyFailure({ successful: false, data: { status_code: 429 }, error: "Too many calls" }).kind).toBe("rate_limit");
  });
  it("falls back to other", () => {
    expect(classifyFailure({ successful: false, error: "x" }).kind).toBe("other");
    expect(unsupportedMetric("nothing here")).toBeNull();
  });
});

const ref = (n: number, firstLine: string): ReelRef => ({ key: `b/${n}-x`, brand: "b", folder: `${n}-x`, n, name: "x", closing: null, firstLine, hasCover: true });

describe("matchMedia and cleanHook", () => {
  const refs = [ref(4, "Want more Google reviews for your restaurant? Here's what actually works 👇"), ref(2, "Want a QR code menu for your restaurant? Here are the 5 steps 👇")];
  it("matches by the start of the caption", () => {
    expect(matchMedia("Want more Google reviews for your restaurant? Here's what actually works 👇\n\n📌 Grab", refs)?.n).toBe(4);
    expect(matchMedia("Want a QR code menu for your restaurant? Here are the 5 steps 👇", refs)?.n).toBe(2);
  });
  it("returns null with no match or an empty caption", () => {
    expect(matchMedia("Something unrelated entirely", refs)).toBeNull();
    expect(matchMedia("", refs)).toBeNull();
  });
  it("cleans the first line into a hook", () => {
    expect(cleanHook("Want more Google reviews for your restaurant? Here's what actually works 👇\n\n📌 x")).toBe("Want more Google reviews for your restaurant? Here's what actually works");
    expect(cleanHook("")).toBe("");
  });
});
