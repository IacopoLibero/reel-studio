import type { AssistantKind } from "./shared/types.js";

export type TerminalPermission = "ask" | "edit" | "plan" | "full";

export const PERMISSION_LABELS: Record<TerminalPermission, string> = {
  ask: "Ask before each change",
  edit: "Edit files without asking",
  plan: "Plan only, change nothing",
  full: "Everything, no questions",
};

const CLAUDE_MODE: Record<TerminalPermission, string> = { ask: "default", edit: "acceptEdits", plan: "plan", full: "bypassPermissions" };

const BRAND_DATA_NOTE = (brandsDir: string) =>
  `All the brands' data is in ${brandsDir}/<brand>/ (identity, mascot, reels, carousels, analytics, scheduled.json, reel-questions.md, series.json). You may read all of it.`;

/**
 * The command line that starts Claude Code or Codex in the Terminal page: the permission level and the folder with every brand's data.
 * The Codex flags come from OpenAI's documentation and are not tried with a real Codex.
 */
export function terminalArgs(tool: AssistantKind, level: TerminalPermission, brandsDir: string): string[] {
  if (tool === "codex") {
    const base = ["--add-dir", brandsDir];
    if (level === "full") return ["--dangerously-bypass-approvals-and-sandbox", ...base];
    if (level === "plan") return ["--sandbox", "read-only", "--ask-for-approval", "on-request", ...base];
    if (level === "edit") return ["--sandbox", "workspace-write", "--ask-for-approval", "on-failure", ...base];
    return ["--sandbox", "workspace-write", "--ask-for-approval", "on-request", ...base];
  }
  return ["--permission-mode", CLAUDE_MODE[level], "--add-dir", brandsDir, "--append-system-prompt", BRAND_DATA_NOTE(brandsDir)];
}

/** The tmux session of a tool at a level: a new level starts a new session, because the flags only count at start. */
export const sessionName = (tool: AssistantKind, level: TerminalPermission): string => `reel-${tool}-${level}`;
