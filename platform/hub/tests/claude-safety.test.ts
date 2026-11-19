import { describe, expect, it } from "vitest";
import { IDEAS_ALLOWED_TOOLS, IDEAS_DENIED_TOOLS } from "../src/ideas/prompt.js";
import { DAILY_ALLOWED_TOOLS, DAILY_DENIED_TOOLS } from "../src/daily/claude.js";
import { MAKE_ALLOWED_TOOLS, MAKE_DENIED_TOOLS } from "../src/factory/make-prompt.js";
import { NETWORK_AND_ENV_BASH_DENIES, RESEARCH_BASH_ALLOWED, SECRET_READ_DENIES } from "../src/jobs/claude-safety.js";

const split = (s: string): string[] => s.split(",");

describe("headless Claude jobs that read the web cannot reach credentials", () => {
  it("every secret location is denied for reading, with Read() rules only (Grep/Glob rules are rejected by Claude Code)", () => {
    expect(SECRET_READ_DENIES.every((r) => r.startsWith("Read("))).toBe(true);
    for (const needle of ["**/.env", ".claude/**", ".composio/**", "**/.credentials.json"]) {
      expect(SECRET_READ_DENIES.some((r) => r.includes(needle))).toBe(true);
    }
  });

  it.each([
    ["ideas", IDEAS_ALLOWED_TOOLS, IDEAS_DENIED_TOOLS],
    ["daily", DAILY_ALLOWED_TOOLS, DAILY_DENIED_TOOLS],
    ["make", MAKE_ALLOWED_TOOLS, MAKE_DENIED_TOOLS],
  ])("%s denies the secret reads", (_n, _allowed, denied) => {
    const d = split(denied);
    for (const r of SECRET_READ_DENIES) expect(d).toContain(r);
    expect(d).toContain("Bash(rm -rf:*)");
  });

  it.each([["ideas", IDEAS_ALLOWED_TOOLS], ["daily", DAILY_ALLOWED_TOOLS]])("%s has no unrestricted Bash, only the research commands", (_n, allowed) => {
    const a = split(allowed);
    expect(a).not.toContain("Bash");
    for (const c of RESEARCH_BASH_ALLOWED) expect(a).toContain(c);
  });

  it("make keeps a broad Bash (voice, Blender, render) but blocks the commands that send data out or dump the environment", () => {
    expect(split(MAKE_ALLOWED_TOOLS)).toContain("Bash");
    const d = split(MAKE_DENIED_TOOLS);
    for (const r of NETWORK_AND_ENV_BASH_DENIES) expect(d).toContain(r);
  });
});
