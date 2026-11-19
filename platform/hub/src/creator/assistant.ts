import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseStreamLine } from "../character/claude-stream.js";
import { DESTRUCTIVE_BASH_DENIES, SECRET_READ_DENIES, join as joinTools } from "../jobs/claude-safety.js";
import { runProcess } from "../jobs/process.js";
import type { AssistantSettings } from "../shared/types.js";

/** The assistant may read and look things up on the web. It cannot run commands, write files or read credentials or other brands. */
export const ASSISTANT_ALLOWED_TOOLS = joinTools(["Read", "Glob", "Grep", "WebFetch", "WebSearch"]);

export const assistantDenied = (root: string): string => joinTools(
  ["Bash", "Write", "Edit", "NotebookEdit"], DESTRUCTIVE_BASH_DENIES, SECRET_READ_DENIES,
  ["brand", "reels", "characters", "platform/data", "platform/.env"].map((d) => `Read(${root}/${d}/**)`),
);

/** What `kind` runs when no command is typed. codex is a best guess and untested; claude uses HUB_CLAUDE_BIN. */
export const DEFAULT_COMMANDS: Record<"codex", string> = { codex: "codex exec -" };

/** Splits a command line into words. Single and double quotes group words; there is no shell, so nothing else is interpreted. */
export function splitCommand(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  let any = false;
  for (const ch of line.trim()) {
    if (quote) { if (ch === quote) quote = null; else cur += ch; }
    else if (ch === "'" || ch === '"') { quote = ch; any = true; }
    else if (/\s/.test(ch)) { if (cur || any) { out.push(cur); cur = ""; any = false; } }
    else cur += ch;
  }
  if (quote) throw new Error("The assistant command has an unclosed quote.");
  if (cur || any) out.push(cur);
  return out;
}

/** The environment variables an assistant process gets: how to run and find its own login, nothing else (no hub token, no Composio or other service keys). */
const ENV_ALLOWED = /^(PATH|HOME|USER|LOGNAME|LANG|LC_[A-Z_]+|TERM|TMPDIR|SHELL|TZ|XDG_[A-Z_]+|CLAUDE_[A-Z_]+|ANTHROPIC_[A-Z_]+|OPENAI_[A-Z_]+|CODEX_[A-Z_]+|HTTPS?_PROXY|NO_PROXY|https?_proxy|no_proxy)$/;

export function assistantEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(base).filter(([k, v]) => v !== undefined && ENV_ALLOWED.test(k)));
}

export interface AssistantRun {
  config: AssistantSettings;
  /** HUB_CLAUDE_BIN, used for kind "claude". */
  claudeBin: string;
  model: string;
  prompt: string;
  root: string;
  /** An empty scratch folder to run in. */
  scratch: string;
  env: NodeJS.ProcessEnv;
  /** Added after the filter (a test sets its stand-in command's switches here). */
  extraEnv?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const TIMEOUT_MS = 5 * 60 * 1000;

/**
 * One turn: the whole prompt goes in, the assistant's text comes out.
 * claude: headless `claude -p` with read-only tools. codex and custom: the command reads the prompt on stdin and prints text on stdout;
 * those get no tool restrictions from us, because we cannot set them. Only claude is tested.
 */
export async function runAssistant(o: AssistantRun): Promise<string> {
  mkdirSync(o.scratch, { recursive: true });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), o.timeoutMs ?? TIMEOUT_MS);
  o.signal?.addEventListener("abort", () => ac.abort(), { once: true });
  const env = { ...assistantEnv(o.env), ...(o.extraEnv ?? {}) };
  let timedOut = false;
  ac.signal.addEventListener("abort", () => { timedOut = !o.signal?.aborted; }, { once: true });
  try {
    if (o.config.kind === "claude") return await runClaude(o, env, ac.signal);
    const line = o.config.command.trim() || (o.config.kind === "codex" ? DEFAULT_COMMANDS.codex : "");
    const [cmd, ...args] = splitCommand(line);
    if (!cmd) throw new Error("No assistant command is set. Open Settings and type it.");
    const out: string[] = [];
    let err = "";
    const code = await runProcess({ cmd, args, cwd: o.scratch, env, stdin: o.prompt, signal: ac.signal, onLine: (l, s) => { if (s === "out") out.push(l); else if (l.trim()) err = l.slice(0, 300); } });
    if (timedOut) throw new Error("The assistant took too long and was stopped.");
    if (ac.signal.aborted) throw new Error("Cancelled");
    if (code !== 0) throw new Error(`The assistant command stopped with exit code ${code}. ${err}`.trim());
    const text = out.join("\n").trim();
    if (!text) throw new Error(`The assistant command printed nothing. ${err}`.trim());
    return text;
  } finally { clearTimeout(timer); }
}

async function runClaude(o: AssistantRun, env: NodeJS.ProcessEnv, signal: AbortSignal): Promise<string> {
  const args = ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "default", "--allowedTools", ASSISTANT_ALLOWED_TOOLS, "--disallowedTools", assistantDenied(o.root)];
  if (o.model) args.push("--model", o.model);
  let answer = "";
  let ok = true;
  let err = "";
  const code = await runProcess({
    cmd: o.claudeBin, args, cwd: o.scratch, env, stdin: o.prompt, signal,
    onLine: (line, stream) => {
      if (stream === "err") { if (line.trim()) err = line.slice(0, 300); return; }
      for (const ev of parseStreamLine(line)) if (ev.kind === "result") { answer = ev.text; ok = ev.ok; }
    },
  });
  if (signal.aborted) throw new Error(o.signal?.aborted ? "Cancelled" : "The assistant took too long and was stopped.");
  if (!ok) throw new Error(`Claude reported an error: ${answer.slice(0, 300) || err || "unknown"}`);
  if (!answer) throw new Error(`Claude returned no answer. ${err || (code !== 0 ? `Exit code ${code}. Is it installed and signed in?` : "")}`.trim());
  return answer;
}

export const scratchDir = (dataDir: string): string => join(dataDir, "tmp-uploads", "interview");
