import { existsSync, readdirSync, readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { jobEnv } from "../env.js";
import { parseStreamLine } from "../character/claude-stream.js";
import type { Handler } from "../jobs/handlers.js";
import { runProcess } from "../jobs/process.js";
import { allocateReelFolder, withFileLock } from "./allocator.js";
import { MAKE_ALLOWED_TOOLS, MAKE_DENIED_TOOLS, buildReelPrompt } from "./make-prompt.js";
import { MAKE_MARKS, MAKE_STEPS, initialMakeState, missingOutputs, reduceMake, type MakeState } from "./make-stream.js";
import { parseQuestions, tickQuestion, type SourceKind } from "./questions.js";

const questionsFile = (root: string, brand: string) => join(root, "brand", brand, "reel-questions.md");

const listFiles = (dir: string): string[] => { try { return readdirSync(dir); } catch { return []; } };

/** Ticks the question in reel-questions.md under a lock, since the file is also edited by hand and by the reel skill. */
export async function tickInFile(root: string, lockDir: string, brand: string, question: string, folder: string, closing: "A" | "B"): Promise<boolean> {
  const file = questionsFile(root, brand);
  return withFileLock(join(lockDir, `questions-${brand}.lock`), async () => {
    const before = readFileSync(file, "utf8");
    const after = tickQuestion(before, question, folder, closing);
    if (after === before) return false;
    writeFileSync(`${file}.tmp`, after);
    renameSync(`${file}.tmp`, file);
    return true;
  });
}

export const reelMake: Handler = async (job, ctx) => {
  const p = job.params as { brand: string; question: string; closing: "A" | "B"; source: string | null; sourceKind: SourceKind };
  const lockDir = join(ctx.dataDir, "locks");
  const redo = typeof job.params.rerunFolder === "string" && /^\d+-[a-z0-9-]+$/.test(job.params.rerunFolder) ? job.params.rerunFolder : null;
  const alloc = redo ? { folder: redo, path: join(ctx.root, "reels", p.brand, redo) } : await allocateReelFolder(ctx.root, p.brand, p.question, lockDir);
  if (redo) {
    if (!existsSync(alloc.path)) throw new Error(`Folder ${redo} to redo does not exist.`);
    for (const f of listFiles(alloc.path)) if (/\.mp4$/i.test(f) || f === "cover.png" || f === "caption.md") rmSync(join(alloc.path, f), { force: true });
  }
  ctx.update({ log: `Folder reels/${p.brand}/${alloc.folder}, closing ${p.closing}`, step: MAKE_STEPS[0], progress: MAKE_MARKS[0] });
  const prompt = buildReelPrompt({ root: ctx.root, brand: p.brand, question: p.question, closing: p.closing, source: p.source, sourceKind: p.sourceKind, folder: alloc.folder, blogDir: ctx.blogDir, ...(ctx.brand ? { brandInfo: ctx.brand.brand } : {}), ...(typeof job.params.note === "string" ? { note: job.params.note } : {}) });
  const args = ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits", "--allowedTools", MAKE_ALLOWED_TOOLS, "--disallowedTools", MAKE_DENIED_TOOLS];
  if (ctx.settings.claudeModel) args.push("--model", ctx.settings.claudeModel);

  let state: MakeState = initialMakeState();
  const skills: string[] = [];
  let stderrLast = "";
  const apply = (ev: Parameters<typeof reduceMake>[1]) => {
    const next = reduceMake(state, ev);
    if (next.stepIndex !== state.stepIndex || next.logs.length !== state.logs.length) {
      ctx.update({ stepIndex: next.stepIndex, step: next.step, progress: MAKE_MARKS[next.stepIndex] ?? 0, log: next.logs.slice(state.logs.length) });
    }
    state = next;
  };
  const poll = setInterval(() => apply({ kind: "files", present: listFiles(alloc.path) }), 2000);
  try {
    const code = await runProcess({
      cmd: ctx.claudeBin, args, cwd: ctx.root, env: jobEnv(ctx.settings, ctx.brand?.slug ?? null), stdin: prompt, signal: ctx.signal,
      onLine: (line, stream) => {
        if (stream === "err") { if (line.trim()) { stderrLast = line.slice(0, 300); ctx.update({ log: `[stderr] ${stderrLast}` }); } return; }
        for (const ev of parseStreamLine(line)) {
          if (ev.kind === "tool" && ev.name === "Skill") {
            const sk = String(ev.input.skill ?? ev.input.command ?? "").replace(/^\//, "");
            if (sk && !skills.includes(sk)) { skills.push(sk); ctx.update({ log: `SKILL CALLED: ${sk}` }); }
          }
          apply(ev);
        }
      },
    });
    if (ctx.signal.aborted) throw new Error("Cancelled");
    const missing = missingOutputs(listFiles(alloc.path));
    if (missing.length) {
      const why = state.lastError || stderrLast || (code !== 0 ? `Claude exited with code ${code}` : "Claude stopped early");
      throw new Error(`Reel not finished (missing ${missing.join(", ")}) in ${alloc.folder}. Last error: ${why}`);
    }
  } finally { clearInterval(poll); }
  if (!skills.includes("reel-hooks")) ctx.update({ log: "Warning: reel-hooks was not called for the opening question." });
  const ticked = await tickInFile(ctx.root, lockDir, p.brand, p.question, alloc.folder, p.closing).catch((e: Error) => { ctx.update({ log: `Could not tick the question: ${e.message}` }); return false; });
  apply({ kind: "files", present: listFiles(alloc.path) });
  return { folder: alloc.folder, key: `${p.brand}/${alloc.folder}`, closing: p.closing, summary: state.summary, ticked, exists: existsSync(alloc.path), skillsUsed: skills };
};
