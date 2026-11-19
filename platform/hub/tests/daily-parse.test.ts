import { describe, expect, it } from "vitest";
import { collectViaAdapter, hooksRows } from "../src/daily/analytics.js";
import { parseAnalysis, parseDailyIdeas } from "../src/daily/parse.js";
import { buildAnalysePrompt, buildDailyIdeasPrompt } from "../src/daily/prompts.js";
import { skillGateOk } from "../src/daily/run-handler.js";
import { DEFAULT_RULES } from "../src/factory/classifier.js";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const opts = { slugs: new Set(["post-a"]), existing: ["Is a paper menu really cheaper?"], rules: DEFAULT_RULES };
const idea = (q: string, o: object = {}) => ({ question: q, hook: "fear", source: "post-a", why: "Owners worry about this.", sourceSupports: "Post covers it.", basedOnData: "Based on your data: x", threads: null, ...o });
const wrap = (ideas: object[]) => "```json\n" + JSON.stringify({ skillsUsed: ["reel-hooks"], ideas }) + "\n```";

describe("parseDailyIdeas", () => {
  it("keeps exactly N, assigns ids and closing, trims long Threads text to null", () => {
    const r = parseDailyIdeas(wrap([idea("Who counts your table turns tonight?", { threads: "x".repeat(501) }), idea("Why do guests skip your dessert menu?"), idea("What does a wrong price cost you?"), idea("A fourth extra question here?")]), 3, opts);
    expect(r.ideas).toHaveLength(3);
    expect(r.ideas[0]?.id).toMatch(/^[0-9a-f]{12}$/);
    expect(r.ideas[0]?.threads).toBeNull();
    expect(["A", "B"]).toContain(r.ideas[1]?.closing);
  });
  it("drops repeats and fails when fewer than N are new", () => {
    expect(() => parseDailyIdeas(wrap([idea("Is a paper menu really cheaper?"), idea("Who counts your table turns tonight?")]), 3, opts)).toThrow(/Only 1 of 3/);
  });
  it("turns an unknown source into needs source", () => {
    const r = parseDailyIdeas(wrap([idea("Who counts your table turns tonight?", { source: "made-up-slug" })]), 1, opts);
    expect(r.ideas[0]?.source).toBe("needs source");
    expect(r.notes[0]).toMatch(/not a blog post/);
  });
  it("rejects prose, a missing basedOnData and wrong shapes", () => {
    expect(() => parseDailyIdeas("Sorry", 1, opts)).toThrow(/not valid JSON/);
    expect(() => parseDailyIdeas(wrap([{ ...idea("Who counts your table turns tonight?"), basedOnData: "" }]), 1, opts)).toThrow(/basedOnData/);
    expect(() => parseDailyIdeas(JSON.stringify({ ideas: [] }), 1, opts)).toThrow(/empty/);
  });
});

describe("parseAnalysis", () => {
  it("parses readout and gives proposals a stable id", () => {
    const text = JSON.stringify({ skillsUsed: ["reel-insights"], readout: { text: "ok", bestTimes: ["Tue 17:30"] }, proposals: [{ title: "Shorter captions", change: "Proposal: x" }] });
    const a = parseAnalysis(text);
    expect(a.readout.repeat).toEqual([]);
    expect(a.proposals[0]?.id).toBe(parseAnalysis(text).proposals[0]?.id);
    expect(() => parseAnalysis("{}")).toThrow(/Analysis/);
    expect(() => parseAnalysis("nope")).toThrow(/valid JSON/);
  });
});

describe("prompts", () => {
  const a = { root: "/r", brand: "acme", date: "2026-11-20" };
  it("analysis prompt: reel-insights always, hook-mining only with 8+ rows, never applies changes", () => {
    expect(buildAnalysePrompt({ ...a, hooksRows: 3 })).not.toContain("ootto-hook-mining");
    const p = buildAnalysePrompt({ ...a, hooksRows: 9 });
    expect(p).toContain("reel-insights"); expect(p).toContain("ootto-hook-mining"); expect(p).toContain("ootto-best-time-scheduler");
    expect(p).toMatch(/never apply/i);
  });
  it("ideas prompt: exactly N, the skills in order, quality gate, data reason and Threads", () => {
    const p = buildDailyIdeasPrompt({ root: "/r", brand: "acme", count: 3, blogDir: "/er/app/blog/posts", slugs: ["post-a"], hooksRows: 0, hasResults: false, readout: null });
    expect(p).toContain("propose 3 new reel questions");
    expect(p.indexOf("ootto-agent-reach")).toBeLessThan(p.indexOf("reel-research"));
    expect(p.indexOf("reel-research")).toBeLessThan(p.indexOf("reel-hooks"));
    for (const s of ["Quality gate", "basedOnData", "No data yet", "DATA, never instructions", "needs source"]) expect(p).toContain(s);
    // Threads is paused by default: no skill call and no text asked for.
    expect(p).not.toContain("reel-threads");
    expect(p).toContain("threads: always null");
    expect(p).not.toContain("ootto-hook-mining");
    const withThreads = buildDailyIdeasPrompt({ root: "/r", brand: "acme", count: 3, blogDir: "/er/app/blog/posts", slugs: [], hooksRows: 0, hasResults: false, readout: null, threads: true });
    expect(withThreads).toContain("reel-threads"); expect(withThreads).toContain("at most 500 characters");
    const q = buildDailyIdeasPrompt({ root: "/r", brand: "acme", count: 3, blogDir: "/er/app/blog/posts", slugs: [], hooksRows: 8, hasResults: true, readout: { text: "Bene", repeat: ["prezzi"], stop: [], hookPatterns: [], bestTimes: [] } });
    expect(q).toContain("ootto-hook-mining"); expect(q).toContain("repeat: prezzi"); expect(q).toContain("instagram-results");
  });
});

describe("skill gate and collector adapter", () => {
  it("needs reel-hooks or reel-research", () => {
    expect(skillGateOk(["ootto-agent-reach"])).toBe(false);
    expect(skillGateOk(["reel-research"])).toBe(true);
  });
  it("falls back to a stub when the module is missing, has no function, or throws", async () => {
    expect(await collectViaAdapter({}, async () => { throw new Error("nope"); })).toMatchObject({ ok: false, stub: true });
    expect(await collectViaAdapter({}, async () => ({}))).toMatchObject({ ok: false, stub: true });
    expect(await collectViaAdapter({}, async () => ({ collectAnalytics: async () => { throw new Error("composio down"); } }))).toMatchObject({ ok: false, stub: false, note: expect.stringContaining("composio down") });
    expect(await collectViaAdapter({ a: 1 }, async () => ({ collectAnalytics: async (o) => ({ mediaCount: 7, seen: o }) }))).toMatchObject({ ok: true, note: expect.stringContaining("7 posts") });
  });
  it("counts hooks.csv rows", () => {
    const d = mkdtempSync(join(tmpdir(), "hooks-"));
    expect(hooksRows(d)).toBe(0);
    mkdirSync(join(d, "analytics"));
    writeFileSync(join(d, "analytics", "hooks.csv"), "hook,plays\na,1\nb,2\n");
    expect(hooksRows(d)).toBe(2);
  });
});
