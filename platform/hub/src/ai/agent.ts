import { existsSync, lstatSync, mkdirSync, readdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { parseStreamLine, type StreamEvent } from "../character/claude-stream.js";
import { createCodexParser } from "./codex-stream.js";
import type { AssistantKind, Settings } from "../shared/types.js";

/** What a job needs from the AI tool: only what it may touch. `read` never changes files; `edit` may change files in its folder and the extra folders. */
export interface AgentOptions {
  access: "read" | "edit";
  /** Claude's allow list (`Read,Glob,Bash(...)`). Codex has no such list: its sandbox decides. */
  allowedTools: string;
  /** Claude's deny list (credentials, curl, git...). Codex cannot be given one. */
  deniedTools?: string;
  /** Folders besides the working folder the tool may use (Claude `--add-dir`, Codex `--add-dir`). */
  addDirs?: readonly string[];
  /** Folders it may only read. Claude gets them with `--add-dir` (the caller denies writes in its deny list); Codex reads outside its working folder by default and is not given write access to them. */
  readDirs?: readonly string[];
  /** A session to continue: Claude's session id or Codex's thread id. */
  resume?: string | null;
  /** Claude's permission mode (default acceptEdits). */
  permissionMode?: "acceptEdits" | "default";
}

export interface AgentContext { settings: Pick<Settings, "claudeModel" | "assistant">; claudeBin: string; /** Default `codex`. */ codexBin?: string }
export interface AgentCommand {
  tool: AssistantKind; cmd: string; args: string[]; parse: (line: string) => StreamEvent[];
  /** The text to send on stdin: the prompt, and for Codex a note on how skills are used here (the hub checks the calls by watching the SKILL.md being opened). */
  prompt: (text: string) => string;
}

const CODEX_SKILL_NOTE = `

How to use a skill here: the skills are folders in .agents/skills/<name>/ with a SKILL.md. To use one, open its SKILL.md with a shell command (for example: cat .agents/skills/<name>/SKILL.md) before you rely on it, and follow it. When this task names a skill, open that skill's SKILL.md first. The hub checks that the required skills were really opened.`;

/** The tool all the jobs use: one choice for everything, Claude or Codex (Settings > Brand assistant). */
export const toolOf = (ctx: Pick<AgentContext, "settings">): AssistantKind => (ctx.settings?.assistant?.kind === "codex" ? "codex" : "claude");

/**
 * The command of one headless run and the parser of its output. Claude: `claude -p` with stream-json and the allow and deny lists.
 * Codex (from OpenAI's non-interactive documentation): `codex exec --json` with a sandbox: read-only, or workspace-write with network access
 * on (the voice server and the renders run on this machine); `-` makes it read the prompt from stdin.
 */
export function agentCommand(ctx: AgentContext, o: AgentOptions): AgentCommand {
  const dirs = o.addDirs ?? [];
  if (toolOf(ctx) === "codex") {
    const args = ["exec", "--json", "--skip-git-repo-check", "--sandbox", o.access === "edit" ? "workspace-write" : "read-only"];
    if (o.access === "edit") args.push("-c", "sandbox_workspace_write.network_access=true");
    for (const d of dirs) args.push("--add-dir", d);
    if (o.resume) args.push("resume", o.resume);
    args.push("-");
    return { tool: "codex", cmd: ctx.codexBin ?? "codex", args, parse: createCodexParser(), prompt: (t) => `${t}${CODEX_SKILL_NOTE}` };
  }
  const args = ["-p", "--output-format", "stream-json", "--verbose", ...(o.resume ? ["--resume", o.resume] : []), "--permission-mode", o.permissionMode ?? "acceptEdits", "--allowedTools", o.allowedTools];
  if (o.deniedTools) args.push("--disallowedTools", o.deniedTools);
  for (const d of [...dirs, ...(o.readDirs ?? [])]) args.push("--add-dir", d);
  if (ctx.settings?.claudeModel) args.push("--model", ctx.settings.claudeModel);
  return { tool: "claude", cmd: ctx.claudeBin, args, parse: parseStreamLine, prompt: (t) => t };
}

/**
 * Codex finds skills in `.agents/skills` (not in Claude's `.claude/skills`): every skill of `.claude/skills` is linked there, next to the Remotion skills
 * that are already in it. Nothing that exists is replaced. Returns the names linked.
 */
export function linkSkillsForCodex(root: string): string[] {
  const from = join(root, ".claude", "skills");
  const to = join(root, ".agents", "skills");
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const linked: string[] = [];
  for (const name of readdirSync(from)) {
    const target = join(to, name);
    try { lstatSync(target); continue; } catch { /* free */ }
    try { symlinkSync(join(from, name), target); linked.push(name); } catch { /* a broken link in the way: leave it */ }
  }
  return linked;
}

/**
 * A job that must call a skill checks it afterwards, with Claude and with Codex: a missing call is an error. Claude's Skill tool says exactly what was
 * called; for Codex a skill counts as called when its SKILL.md was opened by a command (the prompt tells it to do so).
 */
export function requireSkill(_ctx: AgentContext & { update: (p: { log: string }) => void }, ok: boolean, message: string): void {
  if (!ok) throw new Error(message);
}
