import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reelInsights, scheduleSuggest, seriesPlan } from "../src/analytics/handlers.js";
import { analyticsSpec } from "../src/analytics/jobs.js";
import { parseCliOutput, cliRunner } from "../src/analytics/composio.js";
import { analyticsView } from "../src/analytics/view.js";
import { readBestTimes, writeSnapshot } from "../src/analytics/store.js";
import type { MediaRecord, Snapshot } from "../src/analytics/schemas.js";
import { createSchema } from "../src/jobs/create.js";
import { DEFAULT_SETTINGS } from "../src/settings.js";
import type { Job, JobPatch } from "../src/shared/types.js";
import { testRegistry } from "./helpers/brand.js";
import type { BrandCtx } from "../src/brands/context.js";

const FAKE = join(import.meta.dirname, "fixtures/fake-claude-analytics.mjs");
let tmp: string, root: string, data: string, bctx: BrandCtx;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "anj-"));
  root = join(tmp, "root"); data = join(tmp, "data");
  mkdirSync(data);
  bctx = testRegistry(root, data, "acme").ctx;
  data = bctx.paths.dataDir;
  writeFileSync(join(root, "brand/acme/reel-questions.md"), "## To do\n\n- [ ] Is a paper menu really cheaper? · hook: myth · source: needs source\n- [ ] How long does a QR menu take? · hook: effort · source: needs source\n");
});
afterEach(() => { for (const k of ["FAKE_SKILL", "FAKE_ANSWER"]) delete process.env[k]; rmSync(tmp, { recursive: true, force: true }); });

const reel = (id: string, postedAt: string, plays: number): MediaRecord => ({ id, permalink: "", captionStart: "c", hook: "h", postedAt, mediaType: "VIDEO", productType: "REELS", reel: null, metrics: { plays, reach: plays }, insights: "ok", skipped: [] });
const snapshot = (n: number): Snapshot => ({ version: 1, collectedAt: "2026-11-19T12:00:00.000Z", igUserId: "1", warnings: [], media: Array.from({ length: n }, (_, i) => reel(`r${i}`, `2026-11-${String(1 + i).padStart(2, "0")}T16:30:00+0000`, 10 + i)) });
const run = (h: typeof reelInsights, params: Record<string, unknown> = {}) => {
  const patches: JobPatch[] = [];
  const job = { id: "j", type: "reel.insights", brand: "acme", params } as unknown as Job;
  return { patches, p: h(job, { update: (x) => patches.push(x), signal: new AbortController().signal, settings: DEFAULT_SETTINGS, brand: bctx, root, claudeBin: FAKE, dataDir: data, blogDir: "", startedAtMs: 0 }) };
};

describe("reel.insights", () => {
  it("fails without a snapshot", async () => { await expect(run(reelInsights).p).rejects.toThrow(/Refresh/); });
  it("saves the readout when the skill was called", async () => {
    writeSnapshot(data, "2026-11-19", snapshot(3));
    process.env.FAKE_SKILL = "reel-insights"; process.env.FAKE_ANSWER = "Come sta andando: bene";
    const r = await run(reelInsights).p;
    expect(readFileSync(String(r.file), "utf8")).toBe("Come sta andando: bene");
    expect(analyticsView(data).readout?.markdown).toContain("bene");
  });
  it("refuses an answer that did not use the skill", async () => {
    writeSnapshot(data, "2026-11-19", snapshot(3));
    process.env.FAKE_ANSWER = "x";
    await expect(run(reelInsights).p).rejects.toThrow(/reel-insights skill/);
  });
});

describe("series.plan", () => {
  const plan = { name: "Myth busters", promise: "One myth a week", cadence: "weekly", exampleHooks: ["Is a paper menu really cheaper?"], questions: ["Is a paper menu really cheaper?", "Invented question not in the list"], why: "w" };
  it("keeps only questions that exist and maps them to ids", async () => {
    process.env.FAKE_SKILL = "series-planner"; process.env.FAKE_ANSWER = JSON.stringify(plan);
    const r = await run(seriesPlan).p;
    const proposal = r.proposal as { questionIds: string[]; questions: string[] };
    expect(proposal.questions).toEqual(["Is a paper menu really cheaper?"]);
    expect(proposal.questionIds).toHaveLength(1);
  });
  it("rejects bad JSON and a missing skill", async () => {
    process.env.FAKE_SKILL = "series-planner"; process.env.FAKE_ANSWER = "prose";
    await expect(run(seriesPlan).p).rejects.toThrow(/valid JSON/);
    process.env.FAKE_SKILL = ""; process.env.FAKE_ANSWER = JSON.stringify(plan);
    await expect(run(seriesPlan).p).rejects.toThrow(/series-planner/);
  });
});

describe("schedule.suggest", () => {
  it("with too little data says so, shows the pattern defaults and calls no Claude", async () => {
    writeSnapshot(data, "2026-11-19", snapshot(2));
    const r = await run(scheduleSuggest).p;
    expect(r.enough).toBe(false);
    expect(String(r.message)).toMatch(/too little/i);
    expect(readBestTimes(data)?.defaults).toHaveLength(7);
  });
  it("uses Claude and the skill with enough data", async () => {
    writeSnapshot(data, "2026-11-19", snapshot(9));
    process.env.FAKE_SKILL = "best-time-scheduler";
    process.env.FAKE_ANSWER = JSON.stringify({ basedOn: "8 reels", note: "", suggestions: [{ day: "Tue", time: "17:30", why: "most plays" }] });
    const r = await run(scheduleSuggest).p;
    expect(r.enough).toBe(true);
    expect(readBestTimes(data)?.suggestions[0]?.time).toBe("17:30");
  });
  it("works with no snapshot at all", async () => {
    expect((await run(scheduleSuggest).p).enough).toBe(false);
  });
});

describe("job schema and spec", () => {
  it("accepts the four analytics types with defaults", () => {
    for (const type of ["analytics.collect", "reel.insights", "series.plan", "schedule.suggest"]) expect(createSchema.safeParse({ type }).success).toBe(true);
    expect(createSchema.safeParse({ type: "series.plan", params: { focus: "x".repeat(400) } }).success).toBe(false);
  });
  it("refuses a second running job of the same type and an unknown brand", () => {
    const body = createSchema.parse({ type: "analytics.collect" });
    if (body.type !== "analytics.collect") throw new Error("type");
    const busy = [{ type: "analytics.collect", brand: "acme", status: "running" }] as Job[];
    expect(() => analyticsSpec(body, { root, jobs: busy, brand: "acme" })).toThrow(/already running/);
    expect(analyticsSpec(body, { root, jobs: [], brand: "acme" }).steps).toHaveLength(3);
    const ins = createSchema.parse({ type: "reel.insights" });
    if (ins.type !== "reel.insights") throw new Error("type");
    expect(() => analyticsSpec(ins, { root, jobs: [], brand: "nope" })).toThrow(/no reel-questions/);
    // another brand running the same job does not block this one
    expect(analyticsSpec(body, { root, jobs: [{ type: "analytics.collect", brand: "other", status: "running" }] as Job[], brand: "acme" }).brand).toBe("acme");
  });
});

describe("composio runner", () => {
  it("parses JSON with a banner around it and rejects garbage", () => {
    expect(parseCliOutput('note\n{"successful":true}\n')).toEqual({ successful: true });
    expect(() => parseCliOutput("nothing")).toThrow(/not JSON/);
  });
  it("refuses any tool that is not a read-only Instagram GET, and a missing binary", async () => {
    await expect(cliRunner("/nonexistent")("INSTAGRAM_CREATE_POST", {})).rejects.toThrow(/read-only/);
    await expect(cliRunner("/nonexistent")("INSTAGRAM_GET_IG_USER_MEDIA", {})).rejects.toThrow(/not found/);
  });
  it("runs a binary and reads its JSON even on a non-zero exit", async () => {
    const bin = join(tmp, "fake-composio.sh");
    writeFileSync(bin, '#!/bin/sh\necho \'{"successful":false,"error":"e"}\'\nexit 1\n', { mode: 0o755 });
    expect(await cliRunner(bin)("INSTAGRAM_GET_IG_USER_MEDIA", { a: 1 })).toEqual({ successful: false, error: "e" });
    expect(existsSync(bin)).toBe(true);
  });
});
