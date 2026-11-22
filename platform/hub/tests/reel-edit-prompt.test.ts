import { describe, expect, it } from "vitest";
import { buildEditPrompt } from "../src/reels/edit-prompt.js";
import { parseStreamLine } from "../src/character/claude-stream.js";

const base = { root: "/ws", brand: "acme", brandDir: "/d/brands/acme", folder: "3-half-loaf", message: "Make the hook bigger", scheduled: null as string | null, moves: ["idle", "talk"] };

describe("buildEditPrompt", () => {
  it("first turn: gives the reel's folder, the skill, the style guide and the request", () => {
    const p = buildEditPrompt({ ...base, resumed: false });
    expect(p).toContain("/d/brands/acme/reels/3-half-loaf");
    expect(p).toContain("/ws/.claude/skills/reel/SKILL.md");
    expect(p).toContain("/d/brands/acme/identity/style.md");
    expect(p).toContain("Make the hook bigger");
    expect(p).toContain("/d/brands/acme/reels/3-half-loaf/code/");
  });
  it("a later turn is short: the session already knows the reel, so only the request and the reminders go", () => {
    const p = buildEditPrompt({ ...base, resumed: true });
    expect(p).toContain("Make the hook bigger");
    expect(p).not.toContain("SKILL.md");
    expect(p.length).toBeLessThan(buildEditPrompt({ ...base, resumed: false }).length);
  });
  it("always keeps the rules: this reel only, render only through the slot queue, no posting, no git", () => {
    for (const resumed of [false, true]) {
      const p = buildEditPrompt({ ...base, resumed });
      expect(p).toMatch(/only this reel/i);
      expect(p).toContain("scripts/slot.sh");
      expect(p).toMatch(/never schedule|do not schedule/i);
      expect(p).toMatch(/git/);
    }
  });
  it("says the change does not reach Instagram when the reel is already scheduled or posted", () => {
    expect(buildEditPrompt({ ...base, resumed: false, scheduled: "2026-12-01 09:00" })).toContain("2026-12-01 09:00");
    expect(buildEditPrompt({ ...base, resumed: false })).not.toMatch(/already scheduled/i);
  });
  it("lists the character moves that exist, only when the brand has any", () => {
    expect(buildEditPrompt({ ...base, resumed: false })).toContain("idle, talk");
    expect(buildEditPrompt({ ...base, resumed: false, moves: [] })).not.toContain("moves");
  });
  it("asks to refresh the outputs the change touches and to say in one short paragraph what changed", () => {
    const p = buildEditPrompt({ ...base, resumed: false });
    expect(p).toMatch(/same file names/i);
    expect(p).toMatch(/caption\.md/);
    expect(p).toMatch(/cover\.png/);
    expect(p).toMatch(/short/i);
  });
});

describe("parseStreamLine session id", () => {
  it("reads the session id from the init line", () => {
    expect(parseStreamLine('{"type":"system","subtype":"init","model":"m","session_id":"s-1"}')).toEqual([{ kind: "init", model: "m", sessionId: "s-1" }]);
  });
  it("leaves the field out when there is none", () => {
    expect(parseStreamLine('{"type":"system","subtype":"init","model":"m"}')).toEqual([{ kind: "init", model: "m" }]);
  });
});
