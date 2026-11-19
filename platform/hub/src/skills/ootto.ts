import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

const run = promisify(execFile);

export const skillSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/),
  risk: z.enum(["safe", "outward", "conflict"]),
  reason: z.string(),
  defaultEnabled: z.boolean(),
  enabled: z.boolean(),
  hidden: z.boolean().default(false),
  group: z.string().default("kept"),
});
export type OttoSkill = z.infer<typeof skillSchema>;
export type Risk = OttoSkill["risk"];
export interface SkillChange { enable: string[]; disable: string[] }

/** Validates a change request against the real skill list. Names are checked, never passed on unchecked. */
export function makeChangeSchema(known: ReadonlyArray<Pick<OttoSkill, "name" | "risk">>) {
  const byName = new Map(known.map((s) => [s.name, s]));
  const name = z.string().regex(/^[a-z0-9-]+$/, "Skill names use lowercase letters, digits and dashes.").superRefine((n, ctx) => { if (!byName.has(n)) ctx.addIssue({ code: "custom", message: `Unknown skill: ${n.slice(0, 40)}` }); });
  return z.object({
    enable: z.array(name).max(100),
    disable: z.array(name).max(100),
    confirmOutward: z.boolean().default(false),
  }).partial({ enable: true, disable: true }).transform((v) => ({ enable: v.enable ?? [], disable: v.disable ?? [], confirmOutward: v.confirmOutward })).superRefine((v, ctx) => {
    if (!v.enable.length && !v.disable.length) ctx.addIssue({ code: "custom", message: "Nothing to change." });
    const both = v.enable.find((n) => v.disable.includes(n));
    if (both) ctx.addIssue({ code: "custom", message: `${both} is in both lists.` });
    const outward = v.enable.filter((n) => byName.get(n)?.risk === "outward");
    if (outward.length && !v.confirmOutward) ctx.addIssue({ code: "custom", message: `Confirm first: ${outward.join(", ")} can message people or download from the internet.` });
  });
}

/** Wrapper around scripts/ootto-skills.sh. Every call is execFile with an argument array: no shell string anywhere. */
export class OttoSkills {
  private readonly script: string;
  constructor(root: string, private readonly timeoutMs = 20_000) { this.script = join(root, "scripts", "ootto-skills.sh"); }

  private async exec(args: string[]): Promise<string> {
    try {
      const { stdout } = await run("bash", [this.script, ...args], { timeout: this.timeoutMs, maxBuffer: 1_000_000, env: { PATH: process.env.PATH, HOME: process.env.HOME } });
      return stdout;
    } catch (e) {
      const err = e as Error & { stderr?: string };
      throw new Error(`The skills script failed: ${(err.stderr?.trim() || err.message).slice(0, 300)}`);
    }
  }

  async list(): Promise<OttoSkill[]> {
    const out = await this.exec(["list"]);
    try { return z.array(skillSchema).parse(JSON.parse(out)); } catch { throw new Error("The skills script returned something unexpected."); }
  }

  async apply(change: SkillChange): Promise<OttoSkill[]> {
    if (change.enable.length) await this.exec(["enable", ...change.enable]);
    if (change.disable.length) await this.exec(["disable", ...change.disable]);
    return this.list();
  }

  /** Defaults on, everything else off (the script's `defaults` only adds). */
  async reset(): Promise<OttoSkill[]> {
    const off = (await this.list()).filter((s) => s.enabled && !s.defaultEnabled).map((s) => s.name);
    if (off.length) await this.exec(["disable", ...off]);
    await this.exec(["defaults"]);
    return this.list();
  }
}

/** Our own skills: they live in .claude/skills/ directly, are always on and are shown read-only. */
export const OUR_SKILLS: ReadonlyArray<{ name: string; description: string }> = [
  { name: "reel", description: "Makes a finished reel from one line." },
  { name: "reel-hooks", description: "Writes and ranks the opening question, optional A/B comparison." },
  { name: "reel-research", description: "Finds facts and trends (through agent-reach) for scripts and ideas." },
  { name: "reel-insights", description: "Reads the analytics and says what to repeat and stop." },
  { name: "reel-threads", description: "Turns a reel into 1-3 Threads posts (text only, never posts)." },
];

/** What the Settings page shows: hidden skills are left out, ours are listed apart. */
export function visibleSkills(list: OttoSkill[]): OttoSkill[] { return list.filter((s) => !s.hidden); }

export function countByRisk(skills: OttoSkill[]): Record<Risk, { total: number; enabled: number }> {
  const c: Record<Risk, { total: number; enabled: number }> = { safe: { total: 0, enabled: 0 }, conflict: { total: 0, enabled: 0 }, outward: { total: 0, enabled: 0 } };
  for (const s of skills) { c[s.risk].total += 1; if (s.enabled) c[s.risk].enabled += 1; }
  return c;
}
