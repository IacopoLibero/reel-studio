import { describe, it, expect } from "vitest";
import { buildReelPrompt, MAKE_ALLOWED_TOOLS, MAKE_DENIED_TOOLS } from "../src/factory/make-prompt.js";

const base = { root: "/r", brand: "acme", question: "Is a paper menu really cheaper?", closing: "A" as const, source: "digital-menu-guide", sourceKind: "blog" as const, folder: "22-paper-menu", blogDir: "/blog/posts" };

describe("buildReelPrompt", () => {
  const p = buildReelPrompt(base);
  it("names the folder, brand, question and skill", () => {
    expect(p).toContain("brand/acme/reels/22-paper-menu");
    expect(p).toContain("Is a paper menu really cheaper?");
    expect(p).toContain(".claude/skills/reel/SKILL.md");
    expect(p).toContain("brand/acme/identity/style.md");
  });
  it("requires a real reel-hooks call before the script, and reel-research when there is no source", () => {
    expect(p).toContain("Skill tool call to \`reel-hooks\`");
    expect(p).toContain("Name the skills you called");
    const noSource = buildReelPrompt({ ...base, source: null, sourceKind: "needs-source" as const });
    expect(noSource).toContain("\`reel-research\`");
  });
  it("waives approvals and forbids Instagram and the question list", () => {
    expect(p).toMatch(/pre-approved/i);
    expect(p).toMatch(/never schedule|do not schedule/i);
    expect(p).toMatch(/do not (edit|tick).*reel-questions/i);
  });
  it("routes heavy work through slot.sh", () => {
    expect(p).toContain("bash scripts/slot.sh voice 1 --");
    expect(p).toContain("bash scripts/slot.sh blender 1 --");
    expect(p).toContain("bash scripts/slot.sh render 3 --");
  });
  it("uses the blog source when it is a slug", () => {
    expect(p).toContain("/blog/posts");
    expect(p).toContain("digital-menu-guide");
    expect(p).toMatch(/option A/);
  });
  it("handles needs-source and closing B", () => {
    const q = buildReelPrompt({ ...base, closing: "B", source: null, sourceKind: "needs-source" });
    expect(q).toMatch(/no numbers/i);
    expect(q).toMatch(/option B/);
    expect(q).not.toContain("/blog/posts");
  });
  it("exposes the tool lists", () => {
    expect(MAKE_ALLOWED_TOOLS).toContain("Bash");
    for (const d of ["rm -rf", "git", "docker", "systemctl", "kill"]) expect(MAKE_DENIED_TOOLS).toContain(`Bash(${d}:*)`);
  });
});
