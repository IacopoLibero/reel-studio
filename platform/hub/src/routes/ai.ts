import { toolOf } from "../ai/agent.js";
import { tmpdir } from "node:os";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { AccessError, type AccessStore, type Provider, PROVIDERS } from "../claude/access.js";
import type { UsageStore } from "../claude/usage.js";
import { jobEnv } from "../env.js";
import { parseStreamLine } from "../character/claude-stream.js";
import { runProcess } from "../jobs/process.js";
import { CODEX_ARGS, codexCommand } from "../creator/assistant.js";
import { HttpError } from "./scope.js";

const accessBody = z.object({ mode: z.enum(["login", "api-key"]), apiKey: z.string().max(400).optional(), removeKey: z.boolean().optional() });
const CHECK_PROMPT = "Reply with the single word ok.";
const CHECK_TIMEOUT_MS = 90_000;

export interface AiServices { access: Record<Provider, AccessStore>; usage: UsageStore }

const provider = (v: string): Provider => {
  if (!(PROVIDERS as readonly string[]).includes(v)) throw new HttpError(404, "That tool is not known.");
  return v as Provider;
};

/**
 * How Claude and Codex sign in (the tool's own login, or an API key), and how much of Claude's subscription is used.
 * A key is only ever written here: the answers carry the last four characters, never the key.
 */
export function aiRoutes(app: FastifyInstance, d: AppDeps, ai: AiServices): void {
  const view = () => ({
    tool: toolOf({ settings: d.settings.get() }),
    claude: { access: ai.access.claude.state(), usage: ai.usage.view() },
    codex: { access: ai.access.codex.state() },
  });
  app.get("/api/ai", async () => view());

  app.put<{ Params: { provider: string } }>("/api/ai/:provider/access", async (req) => {
    const p = provider(req.params.provider);
    const body = accessBody.safeParse(req.body);
    if (!body.success) throw new HttpError(400, "Choose the login or the API key.");
    const store = ai.access[p];
    try {
      if (body.data.removeKey) store.clearKey();
      else {
        if (body.data.apiKey) store.setKey(body.data.apiKey);
        store.setMode(body.data.mode);
      }
    } catch (e) {
      if (e instanceof AccessError) throw new HttpError(400, e.message);
      throw e;
    }
    return { access: store.state() };
  });

  // A tiny real call, to see that the chosen access works (and, for Claude, to read the usage). Costs a few tokens.
  let checking = false;
  app.post<{ Params: { provider: string } }>("/api/ai/:provider/check", async (req) => {
    const p = provider(req.params.provider);
    if (checking) throw new HttpError(409, "A check is already running.");
    checking = true;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), CHECK_TIMEOUT_MS);
    try {
      return await (p === "claude" ? checkClaude(d, ac.signal) : checkCodex(d, ai, ac.signal));
    } finally { clearTimeout(timer); checking = false; }
  });
}

async function checkClaude(d: AppDeps, signal: AbortSignal): Promise<{ ok: boolean; error?: string }> {
  const global = d.settings.get();
  const args = ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "default", "--allowedTools", "", ...(global.claudeModel ? ["--model", global.claudeModel] : [])];
  let ok = true, why = "", stderr = "";
  const code = await runProcess({
    // A neutral folder: no project files and skills to load, so the call stays as small as it can.
    cmd: d.config.claudeBin, args, cwd: tmpdir(), env: jobEnv(global, null), stdin: CHECK_PROMPT, signal,
    onLine: (line, stream) => {
      if (stream === "err") { if (line.trim()) stderr = line.slice(0, 300); return; }
      for (const ev of parseStreamLine(line)) if (ev.kind === "result") { ok = ev.ok; why = ev.text; }
    },
  }).catch((e: Error) => { ok = false; why = e.message; return null; });
  if (signal.aborted) return { ok: false, error: "Claude did not answer in time." };
  if (!ok || (code !== 0 && code !== null)) return { ok: false, error: (why || stderr || `Claude stopped with exit code ${code}.`).slice(0, 400) };
  return { ok: true };
}

async function checkCodex(d: AppDeps, ai: AiServices, signal: AbortSignal): Promise<{ ok: boolean; error?: string }> {
  let out = "", err = "";
  const env = ai.access.codex.apply(Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "HUB_TOKEN" && k !== "ANTHROPIC_API_KEY" && k !== "ANTHROPIC_AUTH_TOKEN")));
  const code = await runProcess({ cmd: codexCommand(), args: [...CODEX_ARGS], cwd: tmpdir(), env, stdin: CHECK_PROMPT, signal, onLine: (l, s) => { if (s === "out") out += `${l}\n`; else if (l.trim()) err = l.slice(0, 300); } })
    .catch((e: Error) => { err = e.message; return null; });
  if (signal.aborted) return { ok: false, error: "Codex did not answer in time." };
  if (code !== 0) return { ok: false, error: (err || `Codex stopped with exit code ${code}.`).slice(0, 400) };
  return out.trim() ? { ok: true } : { ok: false, error: err || "Codex printed nothing." };
}

