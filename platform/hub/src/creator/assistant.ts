import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { applyEnvLayer } from "../env.js";
import { parseStreamLine } from "../character/claude-stream.js";
import { DESTRUCTIVE_BASH_DENIES, SECRET_READ_DENIES, join as joinTools } from "../jobs/claude-safety.js";
import { runProcess } from "../jobs/process.js";
import type { AssistantSettings } from "../shared/types.js";

/** The assistant may read and look things up on the web. It cannot run commands, write files or read credentials or other brands. */
export const ASSISTANT_ALLOWED_TOOLS = joinTools(["Read", "Glob", "Grep", "WebFetch", "WebSearch"]);

/** brand/ holds every brand (identity, character, reels); the hub data folder holds their questions, results and logins. */
export const assistantDenied = (root: string, dataDir?: string): string => joinTools(
  ["Bash", "Write", "Edit", "NotebookEdit"], DESTRUCTIVE_BASH_DENIES, SECRET_READ_DENIES,
  // reels, characters and mascot are the folders of the first layout: until a workspace is moved (and its old copies removed) they still hold brand data.
  ["brand", "reels", "characters", "mascot", "platform/data", "platform/.env"].map((d) => `Read(${root}/${d}/**)`),
  dataDir ? [`Read(${dataDir}/brands/**)`, `Read(${dataDir}/jobs.json)`, `Read(${dataDir}/settings.json)`] : [],
);

/**
 * The arguments of `codex exec` for one turn (OpenAI's non-interactive mode, checked against its documentation):
 * the prompt is read from stdin (`-`); stdout carries only the final answer and progress goes to stderr; the sandbox is read-only, so it cannot
 * write files or change anything; the folder it runs in is an empty scratch folder, not a git repository (`--skip-git-repo-check`); no session file is kept (`--ephemeral`).
 */
/** The Codex command: HUB_CODEX_BIN, else `codex` (found on the PATH). */
export const codexCommand = (env: NodeJS.ProcessEnv = process.env): string => env.HUB_CODEX_BIN?.trim() || "codex";

export const CODEX_ARGS: readonly string[] = ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "-"];

/** The environment variables an assistant process gets: how to run and find its own login, nothing else (no hub token, no Composio or other service keys). */
const ENV_ALLOWED = /^(PATH|HOME|USER|LOGNAME|LANG|LC_[A-Z_]+|TERM|TMPDIR|SHELL|TZ|XDG_[A-Z_]+|CLAUDE_[A-Z_]+|ANTHROPIC_[A-Z_]+|OPENAI_[A-Z_]+|CODEX_[A-Z_]+|HTTPS?_PROXY|NO_PROXY|https?_proxy|no_proxy)$/;

/** The environment without Anthropic credentials: what the codex command gets. */
const withoutAnthropicKeys = (base: NodeJS.ProcessEnv): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(base).filter(([k]) => k !== "ANTHROPIC_API_KEY" && k !== "ANTHROPIC_AUTH_TOKEN"));

export function assistantEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(base).filter(([k, v]) => v !== undefined && ENV_ALLOWED.test(k)));
}

export interface AssistantRun {
  config: AssistantSettings;
  /** HUB_CLAUDE_BIN, used for kind "claude". */
  claudeBin: string;
  /** The Codex command, for kind "codex": this, else HUB_CODEX_BIN, else `codex`. */
  codexBin?: string;
  model: string;
  prompt: string;
  root: string;
  /** An empty scratch folder to run in. */
  scratch: string;
  /** The hub data folder: its brands/ folders (questions, results, logins) are kept unreadable for the assistant. Required, so a caller cannot leave the deny list short. */
  dataDir: string;
  env: NodeJS.ProcessEnv;
  /** Added after the filter (a test sets its stand-in command's switches here). */
  extraEnv?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const TIMEOUT_MS = 5 * 60 * 1000;

/**
 * One turn: the whole prompt goes in, the assistant's text comes out.
 * claude: headless `claude -p` with read-only tools. codex: `codex exec` in a read-only sandbox (see CODEX_ARGS); it reads the prompt on stdin and prints the answer.
 * Codex gets no tool list from us (it has its own sandbox), and a read-only sandbox can still read files the user can read.
 */
export async function runAssistant(o: AssistantRun): Promise<string> {
  mkdirSync(o.scratch, { recursive: true });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), o.timeoutMs ?? TIMEOUT_MS);
  o.signal?.addEventListener("abort", () => ac.abort(), { once: true });
  // Codex gets the Codex access (login or API key) and never an Anthropic key.
  const env = { ...assistantEnv(applyEnvLayer(withoutAnthropicKeys(o.env), "codex")), ...o.extraEnv };
  let timedOut = false;
  ac.signal.addEventListener("abort", () => { timedOut = !o.signal?.aborted; }, { once: true });
  try {
    // Only Claude gets the Claude access (login or API key); codex never receives an Anthropic key.
    if (o.config.kind === "claude") return await runClaude(o, { ...assistantEnv(applyEnvLayer(o.env, "claude")), ...o.extraEnv }, ac.signal);
    const cmd = o.codexBin ?? codexCommand(o.env);
    const out: string[] = [];
    let err = "";
    const code = await runProcess({ cmd, args: [...CODEX_ARGS], cwd: o.scratch, env, stdin: o.prompt, signal: ac.signal, onLine: (l, s) => { if (s === "out") out.push(l); else if (l.trim()) err = l.slice(0, 300); } });
    if (timedOut) throw new Error("The assistant took too long and was stopped.");
    if (ac.signal.aborted) throw new Error("Cancelled");
    if (code !== 0) throw new Error(`Codex stopped with exit code ${code}. Is it installed and signed in (run \`codex login\`)? ${err}`.trim());
    const text = out.join("\n").trim();
    if (!text) throw new Error(`Codex printed nothing. ${err}`.trim());
    return text;
  } finally { clearTimeout(timer); }
}

async function runClaude(o: AssistantRun, env: NodeJS.ProcessEnv, signal: AbortSignal): Promise<string> {
  const args = ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "default", "--allowedTools", ASSISTANT_ALLOWED_TOOLS, "--disallowedTools", assistantDenied(o.root, o.dataDir)];
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
