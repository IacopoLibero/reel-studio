import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { agentCommand, linkSkillsForCodex, requireSkill, toolOf } from "../src/ai/agent.js";
import { createCodexParser, skillOfCommand } from "../src/ai/codex-stream.js";
import { jobEnv } from "../src/env.js";
import { DEFAULT_SETTINGS } from "../src/settings.js";

const ctx = (kind: "claude" | "codex", model = "") => ({ settings: { claudeModel: model, assistant: { kind } }, claudeBin: "/bin/claude", codexBin: "/bin/codex" });
const opts = { allowedTools: "Read,Bash(x:*)", deniedTools: "Bash(rm -rf:*)", addDirs: ["/d/brand"] as const };

describe("agentCommand", () => {
  it("builds the same Claude command the jobs always used", () => {
    const c = agentCommand(ctx("claude", "opus"), { access: "edit", ...opts });
    expect(c).toMatchObject({ tool: "claude", cmd: "/bin/claude" });
    expect(c.args).toEqual(["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits", "--allowedTools", "Read,Bash(x:*)", "--disallowedTools", "Bash(rm -rf:*)", "--add-dir", "/d/brand", "--model", "opus"]);
    expect(agentCommand(ctx("claude"), { access: "read", ...opts, resume: "s1" }).args).toEqual(expect.arrayContaining(["--resume", "s1"]));
  });
  it("builds a Codex command: stdin prompt, json events, a sandbox, no Claude lists or model", () => {
    const edit = agentCommand(ctx("codex", "opus"), { access: "edit", ...opts });
    expect(edit).toMatchObject({ tool: "codex", cmd: "/bin/codex" });
    expect(edit.args).toEqual(["exec", "--json", "--skip-git-repo-check", "--sandbox", "workspace-write", "-c", "sandbox_workspace_write.network_access=true", "--add-dir", "/d/brand", "-"]);
    const read = agentCommand(ctx("codex"), { access: "read", ...opts });
    expect(read.args).toEqual(["exec", "--json", "--skip-git-repo-check", "--sandbox", "read-only", "--add-dir", "/d/brand", "-"]);
    expect(read.args.join(" ")).not.toMatch(/allowedTools|opus|Bash\(/);
  });
  it("continues a Codex thread with resume before the prompt marker", () => {
    const a = agentCommand(ctx("codex"), { access: "edit", ...opts, resume: "thr-1" }).args;
    expect(a.slice(-3)).toEqual(["resume", "thr-1", "-"]);
  });
  it("uses Claude when the setting is missing", () => { expect(toolOf({ settings: undefined as never })).toBe("claude"); });
});

describe("the Codex event stream", () => {
  const run = (lines: unknown[]) => { const p = createCodexParser(); return lines.flatMap((l) => p(JSON.stringify(l))); };
  it("gives the thread id, the messages, the commands and a result with the last message", () => {
    const ev = run([
      { type: "thread.started", thread_id: "t-9" }, { type: "turn.started" },
      { type: "item.started", item: { id: "1", type: "command_execution", command: "bash scripts/slot.sh render 3 -- npx remotion render", status: "in_progress" } },
      { type: "item.completed", item: { id: "2", type: "agent_message", text: "All done." } },
      { type: "turn.completed", usage: { input_tokens: 1, output_tokens: 2 } },
    ]);
    expect(ev).toEqual([
      { kind: "init", model: "", sessionId: "t-9" },
      { kind: "tool", name: "Bash", input: { command: "bash scripts/slot.sh render 3 -- npx remotion render" } },
      { kind: "text", text: "All done." },
      { kind: "result", ok: true, text: "All done.", cost: null },
    ]);
  });
  it("reports a skill when its SKILL.md is read, a file change as Write or Edit, and a web search", () => {
    const ev = run([
      { type: "item.started", item: { type: "command_execution", command: "cat .agents/skills/reel-hooks/SKILL.md" } },
      { type: "item.started", item: { type: "file_change", changes: [{ path: "/a/new.txt", kind: "add" }, { path: "/a/old.txt", kind: "update" }] } },
      { type: "item.started", item: { type: "web_search", query: "sourdough" } },
    ]);
    expect(ev).toEqual([
      { kind: "tool", name: "Bash", input: { command: "cat .agents/skills/reel-hooks/SKILL.md" } },
      { kind: "tool", name: "Skill", input: { skill: "reel-hooks" } },
      { kind: "tool", name: "Write", input: { file_path: "/a/new.txt" } },
      { kind: "tool", name: "Edit", input: { file_path: "/a/old.txt" } },
      { kind: "tool", name: "WebSearch", input: { query: "sourdough" } },
    ]);
  });
  it("turns a failed turn or an error before the thread started into a failed result, and ignores noise", () => {
    expect(run([{ type: "turn.failed", error: { message: "rate limit" } }])).toEqual([{ kind: "result", ok: false, text: "rate limit", cost: null }]);
    expect(run([{ type: "error", message: "not logged in" }])).toEqual([{ kind: "result", ok: false, text: "not logged in", cost: null }]);
    expect(run([{ type: "thread.started", thread_id: "x" }, { type: "error", message: "reconnecting" }])).toEqual([{ kind: "init", model: "", sessionId: "x" }]);
    const p = createCodexParser();
    expect(p("not json")).toEqual([]); expect(p("")).toEqual([]); expect(p(JSON.stringify({ type: "item.completed", item: { type: "reasoning", text: "hmm" } }))).toEqual([]);
  });
});

describe("skills for Codex", () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "skills-")); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  it("links the skills of .claude/skills into .agents/skills without replacing anything", () => {
    mkdirSync(join(root, ".claude/skills/reel"), { recursive: true }); mkdirSync(join(root, ".claude/skills/reel-hooks"), { recursive: true });
    mkdirSync(join(root, ".agents/skills/reel-hooks"), { recursive: true }); writeFileSync(join(root, ".agents/skills/reel-hooks/own.md"), "mine");
    expect(linkSkillsForCodex(root)).toEqual(["reel"]);
    expect(lstatSync(join(root, ".agents/skills/reel")).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(root, ".agents/skills/reel"))).toBe(join(root, ".claude/skills/reel"));
    expect(existsSync(join(root, ".agents/skills/reel-hooks/own.md"))).toBe(true);
    expect(linkSkillsForCodex(root)).toEqual([]);
  });
  it("does nothing when there are no Claude skills", () => { expect(linkSkillsForCodex(root)).toEqual([]); expect(existsSync(join(root, ".agents"))).toBe(false); });
});

describe("the environment of a job", () => {
  const base = { PATH: "/bin", ANTHROPIC_API_KEY: "sk-ant", OPENAI_API_KEY: "sk-oa", HUB_TOKEN: "T" };
  it("never gives codex an Anthropic key or the hub token, and keeps the others", () => {
    const e = jobEnv({ ...DEFAULT_SETTINGS, assistant: { kind: "codex" } }, "acme", base);
    expect(e.ANTHROPIC_API_KEY).toBeUndefined(); expect(e.HUB_TOKEN).toBeUndefined(); expect(e.OPENAI_API_KEY).toBe("sk-oa"); expect(e.REEL_BRAND).toBe("acme");
  });
  it("keeps the Claude environment for Claude", () => { expect(jobEnv(DEFAULT_SETTINGS, null, base).ANTHROPIC_API_KEY).toBe("sk-ant"); });
});

describe("requireSkill", () => {
  it("is an error for Claude and for Codex when the skill was not called", () => {
    const c = (kind: "claude" | "codex") => ({ ...ctx(kind), update: () => undefined });
    expect(() => requireSkill(c("claude"), false, "no skill")).toThrow("no skill");
    expect(() => requireSkill(c("codex"), false, "no skill")).toThrow("no skill");
    requireSkill(c("codex"), true, "x");
  });
});

describe("how Codex is told about skills", () => {
  it("adds a note for Codex only, and leaves a Claude prompt as it is", () => {
    expect(agentCommand(ctx("claude"), { access: "read", ...opts }).prompt("do it")).toBe("do it");
    const p = agentCommand(ctx("codex"), { access: "read", ...opts }).prompt("do it");
    expect(p.startsWith("do it")).toBe(true);
    expect(p).toContain(".agents/skills/<name>/SKILL.md");
    expect(p).toContain("cat .agents/skills/<name>/SKILL.md");
  });
  it("recognises a skill read through its link, its folder or the ootto source folder", () => {
    for (const [cmd, name] of [
      ["cat .agents/skills/reel-hooks/SKILL.md", "reel-hooks"],
      ["sed -n '1,200p' /w/.agents/skills/ootto-hook-mining/SKILL.md", "ootto-hook-mining"],
      ["cat /usr/lib/reel-studio/platform/skills/ootto/hook-mining/SKILL.md", "ootto-hook-mining"],
      ["head -50 .claude/skills/reel-research/SKILL.md", "reel-research"],
    ] as const) expect(skillOfCommand(cmd)).toBe(name);
    expect(skillOfCommand("ls .agents/skills")).toBeNull();
    expect(skillOfCommand("cat package.json")).toBeNull();
  });
});
