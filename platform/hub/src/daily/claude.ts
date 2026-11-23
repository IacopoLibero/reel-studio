import { agentCommand } from "../ai/agent.js";
import { DESTRUCTIVE_BASH_DENIES, RESEARCH_BASH_ALLOWED, SECRET_READ_DENIES, join as joinTools } from "../jobs/claude-safety.js";
import { jobEnv } from "../env.js";
import type { HandlerCtx } from "../jobs/handlers.js";
import { runProcess } from "../jobs/process.js";

export const DAILY_ALLOWED_TOOLS = joinTools(["Read", "Glob", "Grep", "Skill", "WebFetch", "WebSearch"], RESEARCH_BASH_ALLOWED);
export const DAILY_DENIED_TOOLS = joinTools(DESTRUCTIVE_BASH_DENIES, SECRET_READ_DENIES);

export interface ClaudeRun { answer: string; called: string[] }

/** One headless `claude -p` run that only reads and researches. Returns Claude's final text and the skills it really called. */
export async function runClaude(ctx: HandlerCtx, prompt: string, addDirs: readonly string[] = [], onTool?: (line: string) => void): Promise<ClaudeRun> {
  const agent = agentCommand(ctx, { access: "read", allowedTools: DAILY_ALLOWED_TOOLS, deniedTools: DAILY_DENIED_TOOLS, addDirs });
  const called: string[] = [];
  let answer = "";
  let ok = true;
  let stderrLast = "";
  const code = await runProcess({
    cmd: agent.cmd, args: agent.args, cwd: ctx.root, env: jobEnv(ctx.settings, ctx.brand?.slug ?? null), stdin: prompt, signal: ctx.signal,
    onLine: (line, stream) => {
      if (stream === "err") { if (line.trim()) { stderrLast = line.slice(0, 300); ctx.update({ log: `[stderr] ${stderrLast}` }); } return; }
      for (const ev of agent.parse(line)) {
        if (ev.kind === "tool") {
          if (ev.name === "Skill") {
            const sk = String(ev.input.skill ?? ev.input.command ?? "").replace(/^\//, "");
            if (sk && !called.includes(sk)) called.push(sk);
            ctx.update({ log: `SKILL CALLED: ${sk}` });
          }
          onTool?.(ev.name);
          ctx.update({ log: `> ${ev.name} ${String(ev.input.file_path ?? ev.input.skill ?? ev.input.pattern ?? "").slice(0, 120)}`.trim() });
        } else if (ev.kind === "result") { answer = ev.text; ok = ev.ok; }
      }
    },
  });
  if (ctx.signal.aborted) throw new Error("Cancelled");
  if (!ok) throw new Error(`Claude reported an error: ${answer.slice(0, 300) || stderrLast || "unknown"}`);
  if (!answer) throw new Error(`Claude returned no answer. ${stderrLast || (code !== 0 ? `Exit code ${code}. Is it installed and signed in?` : "")}`.trim());
  return { answer, called };
}
