import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OttoSkills, makeChangeSchema } from "../src/skills/ootto.js";

const SCRIPT = join(import.meta.dirname, "../../../scripts/ootto-skills.sh");
let root: string;
const SKILLS = [
  { name: "alpha", risk: "safe", reason: "", defaultEnabled: true },
  { name: "beta", risk: "safe", reason: "", defaultEnabled: false },
  { name: "gamma", risk: "outward", reason: "downloads from the internet", defaultEnabled: false },
  { name: "delta", risk: "conflict", reason: "overlaps the reel skill", defaultEnabled: false },
  { name: "hid", risk: "safe", reason: "", defaultEnabled: true, hidden: true, group: "absorbed" },
];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ootto-"));
  mkdirSync(join(root, "scripts"), { recursive: true });
  copyFileSync(SCRIPT, join(root, "scripts/ootto-skills.sh"));
  chmodSync(join(root, "scripts/ootto-skills.sh"), 0o755);
  mkdirSync(join(root, "platform/skills/ootto"), { recursive: true });
  writeFileSync(join(root, "platform/skills/ootto/manifest.json"), JSON.stringify({ skills: SKILLS }));
  for (const s of SKILLS) { mkdirSync(join(root, "platform/skills/ootto", s.name), { recursive: true }); writeFileSync(join(root, "platform/skills/ootto", s.name, "SKILL.md"), "x"); }
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const make = () => new OttoSkills(root);
const linked = (n: string) => existsSync(join(root, ".claude/skills", `ootto-${n}`)) && lstatSync(join(root, ".claude/skills", `ootto-${n}`)).isSymbolicLink();

describe("OttoSkills wrapper", () => {
  it("lists every skill with the enabled flag", async () => {
    const list = await make().list();
    expect(list.map((s) => s.name)).toEqual(["alpha", "beta", "gamma", "delta", "hid"]);
    expect(list.every((s) => s.enabled === false)).toBe(true);
  });
  it("enables and disables through the script", async () => {
    const o = make();
    const on = await o.apply({ enable: ["alpha", "beta"], disable: [] });
    expect(on.filter((s) => s.enabled).map((s) => s.name)).toEqual(["alpha", "beta"]);
    expect(linked("alpha")).toBe(true);
    const off = await o.apply({ enable: [], disable: ["alpha"] });
    expect(off.find((s) => s.name === "alpha")?.enabled).toBe(false);
    expect(linked("alpha")).toBe(false);
    expect(linked("beta")).toBe(true);
  });
  it("reset turns on the defaults and turns off the rest", async () => {
    const o = make();
    await o.apply({ enable: ["beta", "gamma"], disable: [] });
    const list = await o.reset();
    expect(list.filter((s) => s.enabled).map((s) => s.name)).toEqual(["alpha"]);
  });
  it("never enables a hidden skill and removes its link on defaults", async () => {
    const o = make();
    mkdirSync(join(root, ".claude/skills"), { recursive: true });
    symlinkSync("../../platform/skills/ootto/hid", join(root, ".claude/skills/ootto-hid"));
    const list = await o.reset();
    expect(linked("hid")).toBe(false);
    expect(list.find((s) => s.name === "hid")?.hidden).toBe(true);
    expect(list.filter((s) => s.enabled).map((s) => s.name)).toEqual(["alpha"]);
  });
  it("never goes through a shell: a hostile name is just a refused argument", async () => {
    const o = make();
    await expect(o.apply({ enable: ["alpha; touch pwned"], disable: [] })).rejects.toThrow(/unknown skill/i);
    expect(existsSync(join(root, "pwned"))).toBe(false);
  });
  it("reports a script failure clearly", async () => {
    rmSync(join(root, "scripts/ootto-skills.sh"));
    await expect(make().list()).rejects.toThrow(/skills script/i);
  });
});

describe("makeChangeSchema", () => {
  const schema = makeChangeSchema(SKILLS);
  it("accepts known names and defaults to empty lists", () => {
    expect(schema.parse({ enable: ["alpha"] })).toEqual({ enable: ["alpha"], disable: [], confirmOutward: false });
  });
  it("rejects unknown names, odd characters, overlap and non-arrays", () => {
    expect(schema.safeParse({ enable: ["nope"] }).success).toBe(false);
    expect(schema.safeParse({ enable: ["../x"] }).success).toBe(false);
    expect(schema.safeParse({ enable: ["alpha"], disable: ["alpha"] }).success).toBe(false);
    expect(schema.safeParse({ enable: "alpha" }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });
  it("needs confirmation to turn on an outward skill", () => {
    const r = schema.safeParse({ enable: ["gamma"] });
    expect(r.success).toBe(false);
    expect(schema.safeParse({ enable: ["gamma"], confirmOutward: true }).success).toBe(true);
    expect(schema.safeParse({ disable: ["gamma"] }).success).toBe(true);
    expect(schema.safeParse({ enable: ["delta"] }).success).toBe(true);
  });
});
