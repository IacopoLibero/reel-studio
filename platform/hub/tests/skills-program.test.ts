import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PROGRAM_ENTRIES } from "../src/layout/manifest.js";
import { repointSkillLinks, syncProgram } from "../src/layout/sync.js";

let tmp: string, program: string, ws: string;
const SCRIPT = join(import.meta.dirname, "../../../scripts/ootto-skills.sh");
const put = (base: string, rel: string, data = "x") => { const f = join(base, rel); mkdirSync(join(f, ".."), { recursive: true }); writeFileSync(f, data); };
const skills = (base: string) => join(base, ".claude/skills");
const sh = (cwdRoot: string, args: string[], env: Record<string, string> = {}) =>
  execFileSync("bash", [join(cwdRoot, "scripts/ootto-skills.sh"), ...args], { env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env }, encoding: "utf8" });

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "skills-program-"));
  program = join(tmp, "program"); ws = join(tmp, "workspace");
  mkdirSync(program); mkdirSync(ws);
  put(program, "platform/skills/ootto/manifest.json", JSON.stringify({ skills: [{ name: "alpha", risk: "safe", reason: "", defaultEnabled: true }, { name: "beta", risk: "safe", reason: "", defaultEnabled: false }] }));
  for (const n of ["alpha", "beta"]) put(program, `platform/skills/ootto/${n}/SKILL.md`);
  for (const base of [program, ws]) { mkdirSync(join(base, "scripts"), { recursive: true }); copyFileSync(SCRIPT, join(base, "scripts/ootto-skills.sh")); chmodSync(join(base, "scripts/ootto-skills.sh"), 0o755); }
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("the skills script, run from a workspace", () => {
  it("links a skill to the program's folder, not to a copy in the workspace", () => {
    sh(ws, ["enable", "alpha"], { REEL_PROGRAM: program });
    expect(readlinkSync(join(skills(ws), "ootto-alpha"))).toBe(join(program, "platform/skills/ootto/alpha"));
    expect(existsSync(join(skills(ws), "ootto-alpha/SKILL.md"))).toBe(true);
    expect(existsSync(join(ws, "platform"))).toBe(false);
  });
  it("lists the skills of the program and says which are on", () => {
    sh(ws, ["enable", "beta"], { REEL_PROGRAM: program });
    const list = JSON.parse(sh(ws, ["list"], { REEL_PROGRAM: program })) as { name: string; enabled: boolean }[];
    expect(list.map((s) => [s.name, s.enabled])).toEqual([["alpha", false], ["beta", true]]);
  });
  it("finds the program in .reel-studio/program.json when REEL_PROGRAM is not set", () => {
    put(ws, ".reel-studio/program.json", JSON.stringify({ programRoot: program, files: {} }));
    sh(ws, ["defaults"]);
    expect(readlinkSync(join(skills(ws), "ootto-alpha"))).toBe(join(program, "platform/skills/ootto/alpha"));
  });
  it("keeps a relative link when the program is its own workspace", () => {
    sh(program, ["enable", "alpha"]);
    expect(readlinkSync(join(skills(program), "ootto-alpha"))).toBe("../../platform/skills/ootto/alpha");
  });
  it("says so when there is no skills library", () => {
    expect(() => sh(ws, ["enable", "alpha"], { REEL_PROGRAM: join(tmp, "nowhere") })).toThrow(/unknown skill/);
  });
});

describe("repointing the links of switched-on skills", () => {
  const oldLink = (name: string) => { mkdirSync(skills(ws), { recursive: true }); symlinkSync(`../../platform/skills/ootto/${name}`, join(skills(ws), `ootto-${name}`)); };

  it("points links of the first layout (into a copy inside the workspace) at the program, once", () => {
    oldLink("alpha"); oldLink("beta");
    expect(repointSkillLinks(ws, program).sort()).toEqual(["ootto-alpha", "ootto-beta"]);
    expect(readlinkSync(join(skills(ws), "ootto-alpha"))).toBe(join(program, "platform/skills/ootto/alpha"));
    expect(existsSync(join(skills(ws), "ootto-beta/SKILL.md"))).toBe(true);
    expect(repointSkillLinks(ws, program)).toEqual([]);
  });
  it("follows the program when it moves", () => {
    oldLink("alpha"); repointSkillLinks(ws, program);
    const moved = join(tmp, "program-moved"); mkdirSync(moved);
    put(moved, "platform/skills/ootto/alpha/SKILL.md");
    expect(repointSkillLinks(ws, moved)).toEqual(["ootto-alpha"]);
    expect(readlinkSync(join(skills(ws), "ootto-alpha"))).toBe(join(moved, "platform/skills/ootto/alpha"));
  });
  it("leaves alone a skill the program no longer has, real folders, and links that are not Ootto skills", () => {
    oldLink("gone"); mkdirSync(join(skills(ws), "reel"), { recursive: true }); mkdirSync(join(skills(ws), "ootto-real"));
    symlinkSync("/etc", join(skills(ws), "mine"));
    expect(repointSkillLinks(ws, program)).toEqual([]);
    expect(readlinkSync(join(skills(ws), "ootto-gone"))).toBe("../../platform/skills/ootto/gone");
    expect(lstatSync(join(skills(ws), "ootto-real")).isDirectory()).toBe(true);
    expect(readlinkSync(join(skills(ws), "mine"))).toBe("/etc");
  });
  it("does nothing when the workspace has no skills folder", () => {
    expect(repointSkillLinks(ws, program)).toEqual([]);
  });
});

describe("syncing the program into a workspace", () => {
  it("does not copy the skills library and repoints the links, and records where the program is", () => {
    expect(PROGRAM_ENTRIES.some((e) => e.startsWith("platform/skills"))).toBe(false);
    put(program, "scripts/x.sh"); put(program, "sfx/pop.wav");
    mkdirSync(skills(ws), { recursive: true }); symlinkSync("../../platform/skills/ootto/alpha", join(skills(ws), "ootto-alpha"));
    const r = syncProgram({ programRoot: program, workspace: ws, entries: ["scripts", "sfx"] });
    expect(r.relinked).toEqual(["ootto-alpha"]);
    expect(existsSync(join(ws, "platform"))).toBe(false);
    expect(JSON.parse(readFileSync(join(ws, ".reel-studio/program.json"), "utf8")).programRoot).toBe(program);
    expect(existsSync(join(skills(ws), "ootto-alpha/SKILL.md"))).toBe(true);
  });
  it("does not touch the links in a dry run", () => {
    mkdirSync(skills(ws), { recursive: true }); symlinkSync("../../platform/skills/ootto/alpha", join(skills(ws), "ootto-alpha"));
    expect(syncProgram({ programRoot: program, workspace: ws, entries: [], dryRun: true }).relinked).toEqual([]);
    expect(readlinkSync(join(skills(ws), "ootto-alpha"))).toBe("../../platform/skills/ootto/alpha");
  });
});
