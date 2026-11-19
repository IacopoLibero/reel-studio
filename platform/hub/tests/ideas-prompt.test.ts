import { describe, it, expect } from "vitest";
import { buildIdeasPrompt, IDEAS_ALLOWED_TOOLS } from "../src/ideas/prompt.js";

const base = { root: "/r", brand: "acme", count: 10, blogDir: "/er/app/blog/posts", slugs: ["post-a", "post-b"], hasCsv: false, hasComments: false, hasResults: false };

describe("buildIdeasPrompt", () => {
  const p = buildIdeasPrompt(base);
  it("lists the files to read", () => {
    expect(p).toContain("brand/acme/style.md");
    expect(p).toContain("brand/acme/reel-questions.md");
    expect(p).toMatch(/done ones/i);
    expect(p).toContain("/er/app/blog/posts");
    expect(p).toContain("post-a");
    expect(p).toContain("/er/README.md");
    expect(p).toContain("/er/CLAUDE.md");
  });
  it("asks for N ideas in the exact format and eight hooks", () => {
    expect(p).toContain("exactly 10");
    for (const h of ["fear", "curiosity", "myth", "money", "effort", "identity", "proof", "number"]) expect(p).toContain(h);
    expect(p).toContain("needs source");
    expect(p).toMatch(/opening line/i);
  });
  it("sets the safety rules", () => {
    expect(p).toMatch(/no invented statistics/i);
    expect(p).toMatch(/real features|pure tips/i);
    expect(p).toMatch(/differ from (every|all) existing/i);
    expect(p).toMatch(/only (with )?facts (that )?the source/i);
  });
  it("demands strict JSON only", () => {
    expect(p).toMatch(/only (the )?JSON|JSON only/i);
    expect(p).toContain('"ideas"');
    expect(p).toMatch(/do not (write|edit)|never (write|edit)/i);
  });
  it("names our skills, with conditions for the data-driven ones", () => {
    expect(p).toContain("ootto-agent-reach");
    expect(p).toContain("reel-research");
    expect(p).toContain("reel-hooks");
    expect(p).not.toContain("ootto-virality");
    expect(p).not.toContain("ootto-hook-mining");
  });
  it("adds hook-mining and results only when the data exists", () => {
    const q = buildIdeasPrompt({ ...base, hasCsv: true, hasComments: true, hasResults: true });
    expect(q).toContain("ootto-hook-mining");
    expect(q).not.toContain("ootto-comment-mining");
    expect(q).toMatch(/instagram-results/);
  });
  it("makes the Skill calls mandatory, in order, with skillsUsed and a quality gate", () => {
    expect(p).toMatch(/MUST use the Skill tool/);
    expect(p.indexOf("ootto-agent-reach")).toBeLessThan(p.indexOf("reel-hooks"));
    expect(p).toContain("skillsUsed");
    expect(p).toMatch(/Quality gate/);
    expect(p).toMatch(/vague/i);
    expect(p).toMatch(/hook label does not match/i);
    expect(p).toContain("sourceSupports");
    expect(p).toContain('"why"');
  });
  it("allows the Skill tool", () => { expect(IDEAS_ALLOWED_TOOLS.split(",")).toContain("Skill"); });
  it("allows no file-writing tools", () => {
    expect(IDEAS_ALLOWED_TOOLS).not.toMatch(/Write|Edit/);
  });
});
