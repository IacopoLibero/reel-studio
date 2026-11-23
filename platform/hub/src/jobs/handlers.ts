import { agentCommand } from "../ai/agent.js";
import { characterScript, countPngs, moveDir, readMoveFrames } from "../character/gallery.js";
import { initialStreamState, reduceStream, STEPS } from "../character/claude-stream.js";
import { ALLOWED_TOOLS, buildAddMovePrompt, renderCommand } from "../character/prompt.js";
import { jobEnv } from "../env.js";
import { loadScheduler, targetOf } from "../scheduler-bridge.js";
import type { BrandCtx } from "../brands/context.js";
import type { Job, JobPatch, Settings } from "../shared/types.js";
import { runProcess } from "./process.js";
import { reelMake } from "../factory/make-handler.js";
import { reelEdit } from "../reels/edit-handler.js";
import { reelIdeas } from "../ideas/handler.js";
import { dailyRun } from "../daily/run-handler.js";
import { analyticsCollect, reelInsights, scheduleSuggest, seriesPlan } from "../analytics/handlers.js";
import { instagramDelete, instagramReschedule } from "../calendar/handlers.js";
import { brandCreate } from "../creator/create-job.js";
import { characterBuild } from "../creator/character-job.js";
import { characterMoves } from "../creator/moves-job.js";
import { voiceGenerate } from "../creator/voice-job.js";
import type { CreatorServices } from "../creator/services.js";

export interface HandlerCtx {
  update: (p: JobPatch) => void;
  signal: AbortSignal;
  settings: Settings;
  /** The brand the job runs for (null only for a machine without brands). dataDir below is this brand's data folder. */
  brand: BrandCtx | null;
  root: string;
  claudeBin: string;
  /** The Codex command (HUB_CODEX_BIN) for when Codex is the tool. */
  codexBin?: string;
  dataDir: string;
  blogDir: string;
  startedAtMs: number;
  /** Hub services for the brand creator (only the creator jobs use them). */
  creator?: CreatorServices;
}
export type Handler = (job: Job, ctx: HandlerCtx) => Promise<Record<string, unknown>>;

const DEFAULT_FRAMES = 48;

/** The character of the job's brand: its id names the Blender script (brand/<slug>/mascot/<id>.py). */
export function characterOf(ctx: HandlerCtx): { id: string; name: string; mascotDir: string } {
  const c = ctx.brand?.brand.character;
  if (!c?.enabled) throw new Error("This brand has no character.");
  return { id: c.id, name: c.name, mascotDir: (ctx.brand as NonNullable<typeof ctx.brand>).paths.mascotDir };
}

/** Polls the PNG count of a move against 2 * frames and reports it as progress between `from` and `to`. */
function watchRender(ctx: HandlerCtx, move: string, from: number, to: number, label: string): () => void {
  const timer = setInterval(() => {
    const c = characterOf(ctx);
    const total = 2 * (readMoveFrames(c.mascotDir, c.id, move) ?? DEFAULT_FRAMES);
    const count = countPngs(moveDir(c.mascotDir, move), ctx.startedAtMs);
    ctx.update({ progress: from + (to - from) * Math.min(1, count / total), step: `${label}: ${Math.min(count, total)} / ${total} images` });
  }, 1000);
  return () => clearInterval(timer);
}

export const instagramSchedule: Handler = async (job, ctx) => {
  const sched = await loadScheduler();
  const out = await sched.runScheduleJob(job, { update: ctx.update, signal: ctx.signal, settings: ctx.settings, ...(ctx.brand ? { target: targetOf(ctx.brand) } : {}) });
  return out ?? {};
};

export const blenderRender: Handler = async (job, ctx) => {
  const move = String(job.params.move);
  const character = characterOf(ctx);
  const cmd = renderCommand(characterScript(character.mascotDir, character.id), move);
  ctx.update({ step: "Rendering with Blender", stepIndex: 0, log: `$ ${cmd.text}` });
  const stop = watchRender(ctx, move, 0, 0.98, "Rendering");
  try {
    const code = await runProcess({
      cmd: cmd.cmd, args: cmd.args, cwd: ctx.root, env: jobEnv(ctx.settings, ctx.brand?.slug ?? null), signal: ctx.signal,
      onLine: (l) => l.trim() && ctx.update({ log: l.slice(0, 300) }),
    });
    if (ctx.signal.aborted) throw new Error("Cancelled");
    if (code !== 0) throw new Error(`Blender stopped with exit code ${code}. See the log for details.`);
  } finally { stop(); }
  return { move, images: countPngs(moveDir(character.mascotDir, move)) };
};

export const claudeTask: Handler = async (job, ctx) => {
  const move = String(job.params.move);
  const character = characterOf(ctx);
  const prompt = buildAddMovePrompt(ctx.root, character.mascotDir, character, move, String(job.params.request));
  const agent = agentCommand(ctx, { access: "edit", allowedTools: ALLOWED_TOOLS, addDirs: [character.mascotDir] });
  let state = initialStreamState();
  let cost: number | null = null;
  const stop = watchRender(ctx, move, 0.3, 0.92, "Rendering with Blender");
  const stepProgress = (i: number) => [0.05, 0.12, 0.22, 0.3, 0.95][i] ?? 0;
  // The render poller owns progress while rendering; other steps use fixed marks.
  const apply = (next: typeof state) => {
    const patch: JobPatch = { stepIndex: next.stepIndex, log: next.logs.slice(state.logs.length) };
    if (!next.rendering) { patch.step = STEPS[next.stepIndex]; patch.progress = stepProgress(next.stepIndex); }
    ctx.update(patch);
    state = next;
  };
  try {
    const code = await runProcess({
      cmd: agent.cmd, args: agent.args, cwd: ctx.root, env: jobEnv(ctx.settings, ctx.brand?.slug ?? null), stdin: agent.prompt(prompt), signal: ctx.signal,
      onLine: (line, stream) => {
        if (stream === "err") { if (line.trim()) ctx.update({ log: `[stderr] ${line.slice(0, 300)}` }); return; }
        for (const ev of agent.parse(line)) {
          if (ev.kind === "result") cost = ev.cost;
          apply(reduceStream(state, ev));
        }
      },
    });
    if (ctx.signal.aborted) throw new Error("Cancelled");
    if (state.failed) throw new Error(`Claude reported an error: ${state.summary || "unknown"}`);
    if (code !== 0 && !state.finished) throw new Error(`Claude stopped with exit code ${code}. Is it installed and signed in?`);
  } finally { stop(); }
  return { move, summary: state.summary, cost, images: countPngs(moveDir(character.mascotDir, move)) };
};

export const HANDLERS: Partial<Record<Job["type"], Handler>> = {
  "reel.make": reelMake,
  "reel.edit": reelEdit,
  "reel.ideas": reelIdeas,
  "daily.run": dailyRun,
  "instagram.reschedule": instagramReschedule,
  "instagram.delete": instagramDelete,
  "instagram.schedule": instagramSchedule,
  "blender.render": blenderRender,
  "claude.task": claudeTask,
  "analytics.collect": analyticsCollect,
  "reel.insights": reelInsights,
  "series.plan": seriesPlan,
  "schedule.suggest": scheduleSuggest,
  "brand.create": brandCreate,
  "character.build": characterBuild,
  "character.moves": characterMoves,
  "voice.generate": voiceGenerate,
};
