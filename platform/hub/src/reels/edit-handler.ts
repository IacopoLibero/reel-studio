import { cpSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { listMoves } from "../character/gallery.js";
import { parseStreamLine, type StreamEvent } from "../character/claude-stream.js";
import { MAKE_ALLOWED_TOOLS, MAKE_DENIED_TOOLS } from "../factory/make-prompt.js";
import { missingOutputs } from "../factory/make-stream.js";
import { jobEnv } from "../env.js";
import type { Handler } from "../jobs/handlers.js";
import { runProcess } from "../jobs/process.js";
import { appendMessage, readChat, setSession } from "./chat.js";
import { buildEditPrompt } from "./edit-prompt.js";
import { readScheduled, reelDirOf } from "./scanner.js";
import { snapshotReel, VERSIONS_DIR } from "./versions.js";

export const EDIT_STEPS = ["Reading the reel", "Changing it", "Rendering", "Checks", "Done"] as const;
const MARKS = [0.05, 0.25, 0.6, 0.85, 1];

const listFiles = (dir: string): string[] => { try { return readdirSync(dir); } catch { return []; } };
const short = (s: string, n = 140): string => (s.length > n ? `${s.slice(0, n)}…` : s);

/** The step a tool call belongs to (steps only move forward). */
function stepOf(ev: StreamEvent): number | null {
  if (ev.kind !== "tool") return null;
  const cmd = String(ev.input.command ?? "");
  if (ev.name === "Write" || ev.name === "Edit") return 1;
  if (ev.name === "Bash") {
    if (/remotion\s+(render|still)|slot\.sh\s+(render|voice|blender)/.test(cmd)) return 2;
    if (/ffmpeg|ffprobe/.test(cmd)) return 3;
  }
  return null;
}

/** Puts back, from the snapshot, a deliverable that the run left missing or removed. */
function restoreMissing(reelDir: string, snapshot: string): string[] {
  const back: string[] = [];
  const from = join(reelDir, VERSIONS_DIR, snapshot);
  for (const f of listFiles(from)) {
    if (f === "code" || existsSync(join(reelDir, f))) continue;
    if (/\.mp4$/i.test(f) || f === "caption.md" || f === "cover.png") { cpSync(join(from, f), join(reelDir, f)); back.push(f); }
  }
  return back;
}

interface RunResult { code: number | null; sessionId: string | null; summary: string; failed: boolean; lastError: string; stderr: string; sawInit: boolean }

/** One conversation turn about a reel: the person's request goes to Claude (resuming the reel's session), which changes the reel and answers. */
export const reelEdit: Handler = async (job, ctx) => {
  const p = job.params as { folder: string; message: string };
  const brand = ctx.brand;
  if (!brand) throw new Error("This job needs a brand.");
  const dir = reelDirOf(brand.paths.reelsDir, p.folder);
  if (!existsSync(dir)) throw new Error(`Reel ${p.folder} not found.`);
  const schedule = readScheduled(brand.paths.scheduledFile)[`${brand.slug}/${p.folder}`];
  const moves = brand.brand.character.enabled ? listMoves(ctx.root, brand.paths.mascotDir, brand.brand.character.id).filter((m) => m.rendered).map((m) => m.name) : [];

  const chat = readChat(dir);
  appendMessage(dir, { role: "user", text: p.message, jobId: job.id });
  ctx.update({ step: EDIT_STEPS[0], stepIndex: 0, progress: MARKS[0] ?? 0, log: `Reel ${p.folder}: ${short(p.message, 100)}` });
  const snapshot = snapshotReel(dir);

  let stepIndex = 0;
  const attempt = async (sessionId: string | null): Promise<RunResult> => {
    const prompt = buildEditPrompt({ root: ctx.root, brand: brand.slug, brandDir: brand.paths.brandDir, folder: p.folder, message: p.message, scheduled: schedule?.at ?? null, moves, resumed: sessionId !== null });
    const args = ["-p", "--output-format", "stream-json", "--verbose", ...(sessionId ? ["--resume", sessionId] : []), "--permission-mode", "acceptEdits", "--allowedTools", MAKE_ALLOWED_TOOLS, "--disallowedTools", MAKE_DENIED_TOOLS, "--add-dir", brand.paths.brandDir];
    if (ctx.settings.claudeModel) args.push("--model", ctx.settings.claudeModel);
    const r: RunResult = { code: null, sessionId: sessionId, summary: "", failed: false, lastError: "", stderr: "", sawInit: false };
    r.code = await runProcess({
      cmd: ctx.claudeBin, args, cwd: ctx.root, env: jobEnv(ctx.settings, brand.slug), stdin: prompt, signal: ctx.signal,
      onLine: (line, stream) => {
        if (stream === "err") { if (line.trim()) { r.stderr = line.slice(0, 300); ctx.update({ log: `[stderr] ${r.stderr}` }); } return; }
        for (const ev of parseStreamLine(line)) {
          if (ev.kind === "init") { r.sawInit = true; if (ev.sessionId) r.sessionId = ev.sessionId; }
          if (ev.kind === "text") for (const l of ev.text.split("\n").filter((x) => x.trim())) ctx.update({ log: short(l) });
          if (ev.kind === "tool") ctx.update({ log: `> ${ev.name} ${short(String(ev.input.file_path ?? ev.input.command ?? ev.input.pattern ?? ""), 110)}`.trim() });
          if (ev.kind === "result") { r.summary = ev.text; if (!ev.ok) { r.failed = true; r.lastError = ev.text; } }
          const s = stepOf(ev);
          if (s !== null && s > stepIndex) { stepIndex = s; ctx.update({ step: EDIT_STEPS[s], stepIndex: s, progress: MARKS[s] ?? 0 }); }
        }
      },
    });
    return r;
  };

  let run = await attempt(chat.sessionId);
  // A session that is gone (cleaned up, or from another machine) starts a new one with the full context.
  if (chat.sessionId && !run.sawInit && !ctx.signal.aborted) { ctx.update({ log: "The earlier conversation could not be resumed: starting a new one." }); run = await attempt(null); }
  if (ctx.signal.aborted) { restoreMissing(dir, snapshot); throw new Error("Cancelled"); }

  const fail = (why: string): never => {
    const back = restoreMissing(dir, snapshot);
    appendMessage(dir, { role: "claude", text: `I could not finish this change: ${why}${back.length ? ` (put back: ${back.join(", ")})` : ""}`, jobId: job.id });
    throw new Error(why);
  };
  if (run.failed) fail(run.lastError || "Claude reported an error");
  if (run.code !== 0 && !run.summary) fail(run.stderr || `Claude exited with code ${run.code}`);
  const missing = missingOutputs(listFiles(dir));
  if (missing.length) fail(`the reel is missing ${missing.join(", ")} after the change`);

  if (run.sessionId) setSession(dir, run.sessionId);
  const summary = run.summary.trim() || "Done.";
  appendMessage(dir, { role: "claude", text: summary, jobId: job.id });
  ctx.update({ step: EDIT_STEPS[4], stepIndex: 4, progress: 1 });
  return { folder: p.folder, summary, sessionId: run.sessionId, snapshot };
};
