import { describe, it, expect } from "vitest";
import { IDEA_HOOKS, parseClaudeIdeas, normalizeSources, countSchema } from "../src/ideas/schema.js";

const good = { ideas: [{ question: "Why does every guest ask for the Wi-Fi?", hook: "curiosity", source: "needs source", why: "Owners ask it daily.", sourceSupports: "none: tip only" }] };

describe("parseClaudeIdeas", () => {
  it("accepts strict JSON", () => {
    const r = parseClaudeIdeas(JSON.stringify(good), 5);
    expect(r.ok && r.ideas).toHaveLength(1);
  });
  it("accepts JSON inside a code fence or after a short lead-in", () => {
    expect(parseClaudeIdeas("```json\n" + JSON.stringify(good) + "\n```", 5).ok).toBe(true);
    expect(parseClaudeIdeas("Here you go:\n" + JSON.stringify(good), 5).ok).toBe(true);
  });
  it("fails clearly on text with no JSON", () => {
    const r = parseClaudeIdeas("I could not find any ideas.", 5);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/not valid JSON/i);
  });
  it("fails on broken JSON", () => {
    const r = parseClaudeIdeas('{"ideas": [{"question": "x"', 5);
    expect(!r.ok && r.error).toMatch(/not valid JSON/i);
  });
  it("fails on a wrong shape and names the problem", () => {
    const r = parseClaudeIdeas(JSON.stringify({ ideas: [{ question: "Short enough question here?", hook: "boredom", source: "needs source", why: "Owners ask it daily.", sourceSupports: "none: tip only" }] }), 5);
    expect(!r.ok && r.error).toMatch(/hook/i);
  });
  it("fails on an empty list", () => {
    expect(parseClaudeIdeas('{"ideas":[]}', 5).ok).toBe(false);
  });
  it("rejects multi-line questions and bad sources", () => {
    expect(parseClaudeIdeas(JSON.stringify({ ideas: [{ question: "Line one\nline two?", hook: "fear", source: "needs source", why: "Owners ask it daily.", sourceSupports: "none: tip only" }] }), 5).ok).toBe(false);
    expect(parseClaudeIdeas(JSON.stringify({ ideas: [{ question: "A fine question here?", hook: "fear", source: "Some Blog Post!", why: "why text", sourceSupports: "x y z" }] }), 5).ok).toBe(false);
  });
  it("cuts to the requested count", () => {
    const many = { ideas: Array.from({ length: 6 }, (_, i) => ({ question: `Question number ${i} about menus?`, hook: "number", source: "needs source", why: "Owners ask it daily.", sourceSupports: "none: tip only" })) };
    const r = parseClaudeIdeas(JSON.stringify(many), 3);
    expect(r.ok && r.ideas).toHaveLength(3);
  });
  it("requires why and sourceSupports, and reads skillsUsed", () => {
    expect(parseClaudeIdeas(JSON.stringify({ ideas: [{ question: "A fine question here?", hook: "fear", source: "needs source" }] }), 5).ok).toBe(false);
    const r = parseClaudeIdeas(JSON.stringify({ skillsUsed: ["ootto-virality"], ...good }), 5);
    expect(r.ok && r.skillsUsed).toEqual(["ootto-virality"]);
  });
  it("knows the eight hooks", () => { expect(IDEA_HOOKS).toHaveLength(8); });
});

describe("normalizeSources", () => {
  it("turns an unknown slug into needs source and says so", () => {
    const r = normalizeSources([{ question: "q1 long enough?", hook: "fear" as const, source: "made-up-post", why: "why text", sourceSupports: "supports" }, { question: "q2 long enough?", hook: "fear" as const, source: "real-post", why: "why text", sourceSupports: "supports" }], new Set(["real-post"]));
    expect(r.ideas.map((i) => i.source)).toEqual(["needs source", "real-post"]);
    expect(r.notes).toHaveLength(1);
  });
});

describe("countSchema", () => {
  it("defaults to 10 and caps at 30", () => {
    expect(countSchema.parse(undefined)).toBe(10);
    expect(countSchema.safeParse(31).success).toBe(false);
    expect(countSchema.safeParse(0).success).toBe(false);
    expect(countSchema.parse("7")).toBe(7);
  });
});
