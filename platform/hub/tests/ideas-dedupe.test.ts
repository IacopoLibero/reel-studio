import { describe, it, expect } from "vitest";
import { dedupeIdeas, isDuplicate, normalizeQuestion } from "../src/ideas/dedupe.js";

describe("normalizeQuestion", () => {
  it("ignores case, punctuation and spacing", () => {
    expect(normalizeQuestion("  Is a Paper-menu   really cheaper?! ")).toBe("is a paper menu really cheaper");
  });
});

describe("isDuplicate", () => {
  const existing = ["Is a paper menu really cheaper?", "What does one wrong order really cost your kitchen?"];
  it("matches the same question with other punctuation", () => {
    expect(isDuplicate("is a paper menu really cheaper", existing)).toBe(true);
  });
  it("matches a near rewording", () => {
    expect(isDuplicate("What does one wrong order cost your kitchen?", existing)).toBe(true);
  });
  it("lets a different question through", () => {
    expect(isDuplicate("Why does every table need its own QR code?", existing)).toBe(false);
  });
});

describe("dedupeIdeas", () => {
  it("drops ideas that repeat existing questions or each other", () => {
    const r = dedupeIdeas(
      ["Is a paper menu really cheaper?"],
      [{ question: "Is a paper menu really cheaper?" }, { question: "Do waiters forget allergies?" }, { question: "do waiters forget allergies" }, { question: "Who reads a menu first?" }],
    );
    expect(r.kept.map((i) => i.question)).toEqual(["Do waiters forget allergies?", "Who reads a menu first?"]);
    expect(r.dropped).toHaveLength(2);
    expect(r.dropped[0]?.reason).toMatch(/existing/i);
    expect(r.dropped[1]?.reason).toMatch(/another proposal/i);
  });
});
