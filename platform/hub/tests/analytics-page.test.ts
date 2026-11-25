import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyticsView } from "../src/analytics/view.js";
import { appendPageRow, collectPage, insightValue, readPageRows } from "../src/analytics/page.js";
import type { ToolRunner } from "../src/analytics/composio.js";

const NOW = new Date("2026-11-25T08:00:00Z");
const runner = (calls: string[]): ToolRunner => async (slug) => {
  calls.push(slug);
  if (slug === "INSTAGRAM_GET_USER_INFO") return { successful: true, data: { data: { followers_count: 1200, follows_count: 80, media_count: 41 } } };
  return { successful: true, data: { data: [
    { name: "reach", total_value: { value: 900 } }, { name: "views", total_value: { value: 3100 } },
    { name: "profile_views", values: [{ value: 5 }, { value: 44 }] }, { name: "accounts_engaged", total_value: { value: 60 } },
  ] } };
};

describe("page totals", () => {
  it("reads followers and the day's totals", async () => {
    const calls: string[] = [];
    const row = await collectPage(runner(calls), "1784", NOW);
    expect(row).toEqual({ date: "2026-11-25", followers: 1200, following: 80, posts: 41, reach: 900, views: 3100, profileViews: 44, accountsEngaged: 60 });
    expect(calls).toEqual(["INSTAGRAM_GET_USER_INFO", "INSTAGRAM_GET_USER_INSIGHTS"]);
  });
  it("keeps what it could read and leaves the rest unavailable (null, never 0)", async () => {
    const run: ToolRunner = async (slug) => (slug === "INSTAGRAM_GET_USER_INFO" ? { successful: true, data: { followers_count: 90 } } : { successful: false, error: "not supported" });
    const row = await collectPage(run, "", NOW);
    expect(row).toMatchObject({ followers: 90, reach: null, views: null });
  });
  it("finds an insight in both shapes and ignores a missing one", () => {
    expect(insightValue({ data: { data: [{ name: "reach", total_value: { value: 7 } }] } }, "reach")).toBe(7);
    expect(insightValue({ data: [{ name: "x", values: [{ value: 1 }, { value: 2 }] }] }, "x")).toBe(2);
    expect(insightValue({ data: [] }, "reach")).toBeNull();
  });
  it("keeps one row a day, oldest first, and shows it in the analytics view", () => {
    const d = mkdtempSync(join(tmpdir(), "page-"));
    const base = { followers: 1, following: null, posts: null, reach: null, views: null, profileViews: null, accountsEngaged: null };
    appendPageRow(d, "instagram", { ...base, date: "2026-11-25", followers: 10 });
    appendPageRow(d, "instagram", { ...base, date: "2026-11-24", followers: 8 });
    appendPageRow(d, "instagram", { ...base, date: "2026-11-25", followers: 12 });
    expect(readPageRows(d, "instagram").map((r) => [r.date, r.followers])).toEqual([["2026-11-24", 8], ["2026-11-25", 12]]);
    expect(analyticsView(d).pages).toHaveLength(1);
  });
});
