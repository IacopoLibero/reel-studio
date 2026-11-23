import { agentCommand } from "../ai/agent.js";
import { jobEnv } from "../env.js";
import type { HandlerCtx } from "../jobs/handlers.js";
import { runProcess } from "../jobs/process.js";

export const READ_ONLY_TOOLS = "Read,Glob,Grep,Skill";
export const DENIED_BASH = ["rm -rf", "git", "docker", "systemctl", "kill"].map((c) => `Bash(${c}:*)`).join(",");

export interface ClaudeAnswer { answer: string; skills: string[] }

/** Headless Claude (read-only tools) with the prompt on stdin. Returns the final text and the skills it really called. */
export async function runClaudeText(ctx: HandlerCtx, prompt: string, onActivity: () => void = () => undefined): Promise<ClaudeAnswer> {
  const agent = agentCommand(ctx, { access: "read", allowedTools: READ_ONLY_TOOLS, deniedTools: DENIED_BASH });
  let answer = "";
  let ok = true;
  let stderrLast = "";
  const skills: string[] = [];
  const code = await runProcess({
    cmd: agent.cmd, args: agent.args, cwd: ctx.root, env: jobEnv(ctx.settings, ctx.brand?.slug ?? null), stdin: prompt, signal: ctx.signal,
    onLine: (line, stream) => {
      if (stream === "err") { if (line.trim()) { stderrLast = line.slice(0, 300); ctx.update({ log: `[stderr] ${stderrLast}` }); } return; }
      for (const ev of agent.parse(line)) {
        if (ev.kind === "tool") {
          onActivity();
          if (ev.name === "Skill") {
            const sk = String(ev.input.skill ?? ev.input.command ?? "").replace(/^\//, "");
            if (sk && !skills.includes(sk)) skills.push(sk);
            ctx.update({ log: `SKILL CALLED: ${sk}` });
          } else ctx.update({ log: `> ${ev.name} ${String(ev.input.file_path ?? ev.input.pattern ?? "").slice(0, 120)}`.trim() });
        } else if (ev.kind === "text") onActivity();
        else if (ev.kind === "result") { answer = ev.text; ok = ev.ok; }
      }
    },
  });
  if (ctx.signal.aborted) throw new Error("Cancelled");
  if (!ok) throw new Error(`Claude reported an error: ${answer.slice(0, 300) || stderrLast || "unknown"}`);
  if (!answer.trim()) throw new Error(`Claude returned no answer. ${stderrLast || (code !== 0 ? `Exit code ${code}. Is it installed and signed in?` : "")}`.trim());
  return { answer, skills };
}

/** The JSON object in an answer: the whole text, a code fence, or the outermost braces. */
export function extractJson(text: string): unknown {
  const t = text.trim();
  for (const c of [t, /```(?:json)?\s*([\s\S]*?)```/i.exec(t)?.[1], t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)]) {
    if (!c) continue;
    try { return JSON.parse(c.trim()); } catch { /* next */ }
  }
  throw new Error(`Claude's answer was not valid JSON. Start: ${t.slice(0, 160) || "(empty)"}`);
}
