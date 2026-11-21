import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSpec, JobRequestError } from "../src/jobs/create.js";
import { listFactoryQuestions, readBrandQuestions } from "../src/factory/service.js";
import { scanReels } from "../src/reels/scanner.js";
import { invalidateCalendar, lastPosts, readCache, writeCache } from "../src/calendar/cache.js";
import { loadReelRefs } from "../src/calendar/service.js";
import { targetOf } from "../src/scheduler-bridge.js";
import { jobEnv } from "../src/env.js";
import { buildReelPrompt } from "../src/factory/make-prompt.js";
import { buildAddMovePrompt, renderCommand } from "../src/character/prompt.js";
import { characterScript } from "../src/character/gallery.js";
import { buildIdeasPrompt } from "../src/ideas/prompt.js";
import { insightsPrompt } from "../src/analytics/prompts.js";
import { buildDailyIdeasPrompt, buildAnalysePrompt } from "../src/daily/prompts.js";
import { DEFAULT_SETTINGS } from "../src/settings.js";
import type { Job } from "../src/shared/types.js";
import { testBrand, testRegistry, writeTestBrand } from "./helpers/brand.js";

let tmp: string, root: string, data: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "scoping-")); root = join(tmp, "root"); data = join(tmp, "data"); mkdirSync(data); });
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

function reel(brand: string, folder: string, caption = "Caption") {
  const dir = join(root, "brand", brand, "reels", folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "a.mp4"), "v"); writeFileSync(join(dir, "caption.md"), caption); writeFileSync(join(dir, "cover.png"), "p");
}
const Q = (q: string) => `## To do\n\n- [ ] ${q} · hook: myth · source: needs source\n`;

describe("data scoped by brand", () => {
  it("scans only the reels of one brand", () => {
    reel("acme", "1-a"); reel("beta", "1-b");
    expect(scanReels(root, {}).map((r) => r.key)).toEqual(["acme/1-a", "beta/1-b"]);
    expect(scanReels(root, {}, new Set(), "beta").map((r) => r.key)).toEqual(["beta/1-b"]);
    expect(scanReels(root, {}, new Set(), "ghost")).toEqual([]);
  });
  it("reads the questions of one brand and no other", () => {
    writeTestBrand(root, "acme", {}, Q("Is paper cheaper?"), data); writeTestBrand(root, "beta", {}, Q("Is plastic cheaper?"), data);
    expect(readBrandQuestions(join(data, "brands/acme"), "acme").map((q) => q.question)).toEqual(["Is paper cheaper?"]);
    expect(readBrandQuestions(join(data, "brands/ghost"), "ghost")).toEqual([]);
    expect(listFactoryQuestions(root, "beta", join(data, "brands/beta"), DEFAULT_SETTINGS, []).map((q) => [q.brand, q.question])).toEqual([["beta", "Is plastic cheaper?"]]);
  });
  it("matches calendar posts against the reels of the brand only", () => {
    reel("acme", "1-a", "Same first line"); reel("beta", "1-b", "Same first line");
    writeTestBrand(root, "acme", {}, Q("x"), data); writeTestBrand(root, "beta", {}, Q("y"), data);
    expect(loadReelRefs(root, join(data, "brands/acme"), "acme").map((r) => r.key)).toEqual(["acme/1-a"]);
    expect(loadReelRefs(root, join(data, "brands/beta"), "beta").map((r) => r.key)).toEqual(["beta/1-b"]);
  });
  it("keeps one calendar reading per brand", () => {
    invalidateCalendar();
    writeCache("acme", 4, [{ id: "1", scheduledAt: "x", captionStart: "a" }]);
    expect(readCache("beta", 4)).toBeNull();
    expect(lastPosts("beta")).toEqual([]);
    expect(lastPosts("acme")).toHaveLength(1);
    expect(readCache("acme", 2, Date.now())?.fresh).toBe(true);
    expect(readCache("acme", 8)).toBeNull();
    invalidateCalendar("acme");
    expect(lastPosts("acme")).toEqual([]);
    writeCache("beta", 1, []); invalidateCalendar();
    expect(readCache("beta", 1)).toBeNull();
  });
});

describe("jobs of a brand", () => {
  it("make and schedule specs carry the brand and use its files", () => {
    const { ctx } = testRegistry(root, data, "acme", {}, Q("Is paper cheaper?"));
    reel("acme", "1-a"); reel("beta", "1-b");
    const d = { root, brand: ctx, settings: DEFAULT_SETTINGS, jobs: [] as Job[], now: new Date("2026-11-20T09:00:00Z") };
    const q = readBrandQuestions(ctx.paths.dataDir, "acme")[0]!;
    const make = buildSpec({ type: "reel.make", params: { questionId: q.id } }, d);
    expect(make).toMatchObject({ type: "reel.make", brand: "acme", params: { brand: "acme", questionId: q.id } });
    expect(() => buildSpec({ type: "reel.make", params: { questionId: "0".repeat(12) } }, d)).toThrow(JobRequestError);
    const sched = buildSpec({ type: "instagram.schedule", params: { reel: "acme/1-a", date: "2026-11-24", time: "17:30" } }, d);
    expect(sched).toMatchObject({ brand: "acme", params: { reelDir: join(root, "brand/acme/reels/1-a") } });
    // another brand's reel is not found through this brand
    expect(() => buildSpec({ type: "instagram.schedule", params: { reel: "beta/1-b", date: "2026-11-24", time: "17:30" } }, d)).toThrow(/not found/);
  });
  it("the same slot may be used by two brands, but not twice by one", () => {
    const { ctx } = testRegistry(root, data, "acme"); reel("acme", "1-a"); reel("acme", "2-b");
    const d = { root, brand: ctx, settings: DEFAULT_SETTINGS, now: new Date("2026-11-20T09:00:00Z") };
    const other = { type: "instagram.schedule", brand: "beta", status: "queued", params: { reel: "beta/1-b", date: "2026-11-24", time: "17:30" } } as unknown as Job;
    expect(buildSpec({ type: "instagram.schedule", params: { reel: "acme/1-a", date: "2026-11-24", time: "17:30" } }, { ...d, jobs: [other] }).brand).toBe("acme");
    const mine = { ...other, brand: "acme", params: { reel: "acme/2-b", date: "2026-11-24", time: "17:30" } } as Job;
    expect(() => buildSpec({ type: "instagram.schedule", params: { reel: "acme/1-a", date: "2026-11-24", time: "17:30" } }, { ...d, jobs: [mine] })).toThrow(/slot/);
  });
  it("character jobs need a brand with a character and name it", () => {
    const { ctx } = testRegistry(root, data, "acme", { character: { enabled: true, id: "pip", name: "Pip" } });
    const d = { root, brand: ctx, settings: DEFAULT_SETTINGS, jobs: [] as Job[] };
    expect(buildSpec({ type: "blender.render", params: { move: "hop" } }, d).title).toBe("Re-render Pip move: hop");
    expect(buildSpec({ type: "claude.task", params: { move: "hop", request: "jumps high" } }, d).brand).toBe("acme");
  });
  it("the scheduler is given the brand's profile, data folder and offer rule", () => {
    const { ctx } = testRegistry(root, data, "acme", { offer: { lastDay: "2026-11-30", regex: "CODE" }, instagram: { account: "a", userId: "1", profileDir: "/data/chrome-profile" } });
    expect(targetOf(ctx)).toMatchObject({ slug: "acme", profileDir: "/data/chrome-profile", dataDir: join(data, "brands/acme"), offer: { lastDay: "2026-11-30" } });
    const plain = testRegistry(root, data, "beta").ctx;
    expect(targetOf(plain).profileDir).toBe(join(data, "chrome", "beta"));
    expect(targetOf(plain).offer).toEqual({ lastDay: null, pattern: null });
  });
  it("jobs get the brand in their environment and never the hub token", () => {
    const env = jobEnv(DEFAULT_SETTINGS, "acme", { HUB_TOKEN: "x", PATH: "/bin" });
    expect(env).toMatchObject({ REEL_BRAND: "acme", BLENDER_DEVICE: "auto", PATH: "/bin" });
    expect(env.HUB_TOKEN).toBeUndefined();
    expect(jobEnv(DEFAULT_SETTINGS, null, {}).REEL_BRAND).toBeUndefined();
  });
});

describe("prompts take everything from the brand", () => {
  const b = testBrand("acme", { name: "Acme Cafe", about: "We roast coffee.", audience: "cafe owners", closing: { A: { label: "Try Acme", line: "Try Acme at acme.example." }, B: { label: "Follow for tips", line: "Follow me." } }, readoutLanguage: "it" });
  const input = { root: "/r", brand: "acme", folder: "1-a", question: "Q?", source: null, sourceKind: "needs-source" as const, blogDir: "/b" };
  it("the reel prompt quotes the brand's closing lines and has no mascot or product assumption", () => {
    const p = buildReelPrompt({ ...input, closing: "A", brandInfo: b });
    expect(p).toContain("Try Acme at acme.example.");
    expect(p).toContain("Brand: Acme Cafe (folder acme)");
    expect(p).toContain("brand/acme/identity/style.md");
    expect(p).not.toMatch(/restaurant|mascot voice/i);
    expect(buildReelPrompt({ ...input, closing: "B" })).toContain("option B (Follow for tips)");
  });
  it("the ideas and daily prompts speak to the brand's audience and read its data folder", () => {
    const i = { root: "/r", brand: "acme", dataDir: "/d/brands/acme", brandInfo: b, count: 3, blogDir: "/b", slugs: [], hasCsv: false, hasComments: false, hasResults: false };
    const ideas = buildIdeasPrompt(i);
    expect(ideas).toContain("We roast coffee.");
    expect(ideas).toContain("cafe owners use");
    expect(ideas).not.toMatch(/restaurant/i);
    const daily = buildDailyIdeasPrompt({ root: "/r", brand: "acme", brandInfo: b, dataDir: "/d/brands/acme", count: 2, blogDir: "/b", slugs: [], hooksRows: 9, hasResults: false, readout: null });
    expect(daily).toContain("/d/brands/acme/analytics/hooks.csv");
    expect(daily).not.toMatch(/restaurant/i);
    const an = buildAnalysePrompt({ root: "/r", brand: "acme", brandInfo: b, dataDir: "/d/brands/acme", date: "2026-11-20", hooksRows: 9 });
    expect(an).toContain("/d/brands/acme/analytics/");
    expect(an).toContain("plain Italian");
  });
  it("the readout follows the owner's language", () => {
    const o = { root: "/r", brand: "acme", date: "2026-11-20", csvRows: 2, snapshotPath: "/s.json", dir: "/d", questionsFile: "/d/reel-questions.md" };
    expect(insightsPrompt({ ...o, brandInfo: b })).toContain("Da ripetere");
    expect(insightsPrompt({ ...o, brandInfo: { ...b, readoutLanguage: "en" } })).toContain("To repeat");
    expect(insightsPrompt(o)).toContain("To repeat");
  });
  it("the character prompt and Blender script come from the character id", () => {
    const mascotDir = "/r/brand/acme/mascot";
    expect(characterScript(mascotDir, "pip")).toBe("/r/brand/acme/mascot/pip.py");
    const cmd = renderCommand(characterScript(mascotDir, "pip"), "hop", "/nowhere");
    expect(cmd.text).toContain("/r/brand/acme/mascot/pip.py");
    const p = buildAddMovePrompt("/r", mascotDir, { id: "pip", name: "Pip" }, "hop", "jumps", "/nowhere");
    expect(p).toContain("character Pip");
    expect(p).toContain("/r/brand/acme/mascot/pip.py");
    expect(p).toContain("/r/brand/acme/mascot/movements/hop/");
  });
});
