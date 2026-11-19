import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { appendIdeas } from "../src/ideas/append.js";
import { parseQuestions } from "../src/factory/questions.js";

const real = readFileSync(new URL("./fixtures/reel-questions.md", import.meta.url), "utf8");
const count = (md: string) => parseQuestions(md, "x");

describe("appendIdeas with the real reel-questions.md", () => {
  it("fixture parses to 41 questions", () => { expect(count(real)).toHaveLength(41); });

  it("adds under the matching heading and keeps everything else", () => {
    const r = appendIdeas(real, [
      { question: "Who answers when a guest asks about gluten?", hook: "fear", source: "allergen-management-eu-restaurants" },
      { question: "Why do tourists skip dishes they cannot read?", hook: "curiosity", source: "needs source" },
    ]);
    expect(r.added).toHaveLength(2);
    const after = count(r.md);
    expect(after).toHaveLength(43);
    expect(after.filter((q) => q.done)).toHaveLength(23);
    const fear = after.find((q) => q.question.startsWith("Who answers"));
    expect(fear?.hook).toBe("fear");
    expect(fear?.section).toMatch(/^Fear/);
    expect(fear?.source).toBe("allergen-management-eu-restaurants");
    expect(fear?.sourceKind).toBe("blog");
    expect(after.find((q) => q.question.startsWith("Why do tourists"))?.sourceKind).toBe("needs-source");
    // the new fear line sits after the last existing fear line, before the Curiosity heading
    const lines = r.md.split("\n");
    expect(lines.findIndex((l) => l.includes("Who answers"))).toBeLessThan(lines.findIndex((l) => l.startsWith("### Curiosity")));
    expect(r.md.endsWith("\n")).toBe(true);
  });

  it("skips duplicates of existing questions, done ones included", () => {
    const r = appendIdeas(real, [
      { question: "Is a paper menu really cheaper?", hook: "myth", source: "needs source" },
      { question: "Do you really need an app for QR ordering?", hook: "myth", source: "needs source" },
    ]);
    expect(r.added).toHaveLength(0);
    expect(r.skipped).toHaveLength(2);
    expect(r.md).toBe(real);
  });

  it("creates the heading when it is missing", () => {
    const without = real.replace(/### Number[\s\S]*$/, "");
    expect(count(without)).toHaveLength(38);
    const r = appendIdeas(without, [{ question: "What are the 3 numbers a kitchen should track?", hook: "number", source: "improve-restaurant-efficiency" }]);
    const q = count(r.md);
    expect(q).toHaveLength(39);
    expect(q.at(-1)?.hook).toBe("number");
    expect(r.md).toMatch(/\n### Number: a clear list or count\n- \[ \] What are the 3 numbers/);
  });

  it("creates the To do section when there is none", () => {
    const r = appendIdeas("# Title\n\n## Done\n\n- [x] A thing? · hook: myth · `0-a`\n", [{ question: "A new one?", hook: "money", source: "needs source" }]);
    expect(count(r.md).map((q) => q.question)).toEqual(["A thing?", "A new one?"]);
    expect(r.md).toContain("## To do");
  });

  it("keeps the separator out of the question text", () => {
    const r = appendIdeas(real, [{ question: "Cheaper · or faster?", hook: "money", source: "needs source" }]);
    expect(count(r.md).at(-1)?.question ?? "").not.toContain("·");
    expect(count(r.md).some((q) => q.question === "Cheaper, or faster?")).toBe(true);
  });

  it("is idempotent when run twice", () => {
    const i = [{ question: "Who pays for a lost order?", hook: "fear", source: "needs source" }];
    const once = appendIdeas(real, i);
    expect(appendIdeas(once.md, i).added).toHaveLength(0);
  });
});
