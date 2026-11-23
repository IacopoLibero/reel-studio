import { agentCommand, requireSkill } from "../ai/agent.js";
import { jobEnv } from "../env.js";
import { classifyClosing } from "../factory/classifier.js";
import { questionId } from "../factory/questions.js";
import type { Handler } from "../jobs/handlers.js";
import { runProcess } from "../jobs/process.js";
import { dedupeIdeas } from "./dedupe.js";
import { IDEAS_ALLOWED_TOOLS, IDEAS_DENIED_TOOLS, buildIdeasPrompt, productDir } from "./prompt.js";
import { normalizeSources, parseClaudeIdeas } from "./schema.js";
import { blogSlugs, brandData, existingQuestions } from "./service.js";
import { newBatchId, writeBatch } from "./store.js";

export const REQUIRED_IDEA_SKILLS = ["reel-hooks", "reel-research"];
export const IDEAS_STEPS = ["Read context", "Generate", "Check duplicates", "Done"];
const MARKS = [0.05, 0.15, 0.88, 1];

export const reelIdeas: Handler = async (job, ctx) => {
  const brand = ctx.brand?.slug ?? String(job.params.brand);
  const count = Number(job.params.count);
  ctx.update({ step: IDEAS_STEPS[0], stepIndex: 0, progress: MARKS[0], log: `Brand ${brand}, ${count} ideas, reading ${ctx.blogDir} and ${productDir(ctx.blogDir)}` });
  const slugs = blogSlugs(ctx.blogDir);
  const prompt = buildIdeasPrompt({ root: ctx.root, brand, ...(ctx.brand ? { brandInfo: ctx.brand.brand } : {}), count, dataDir: ctx.dataDir, blogDir: ctx.blogDir, slugs, ...brandData(ctx.dataDir) });
  const agent = agentCommand(ctx, { access: "read", allowedTools: IDEAS_ALLOWED_TOOLS, deniedTools: IDEAS_DENIED_TOOLS, addDirs: [ctx.blogDir, productDir(ctx.blogDir)] });

  let answer = "";
  let ok = true;
  let stderrLast = "";
  let calls = 0;
  const called: string[] = [];
  let generating = false;
  const generate = () => { if (!generating) { generating = true; ctx.update({ step: IDEAS_STEPS[1], stepIndex: 1, progress: MARKS[1] }); } };
  const code = await runProcess({
    cmd: agent.cmd, args: agent.args, cwd: ctx.root, env: jobEnv(ctx.settings, ctx.brand?.slug ?? null), stdin: prompt, signal: ctx.signal,
    onLine: (line, stream) => {
      if (stream === "err") { if (line.trim()) { stderrLast = line.slice(0, 300); ctx.update({ log: `[stderr] ${stderrLast}` }); } return; }
      for (const ev of agent.parse(line)) {
        if (ev.kind === "tool") {
          calls += 1;
          if (ev.name === "Skill") {
            generate();
            const sk = String(ev.input.skill ?? ev.input.command ?? "").replace(/^\//, "");
            if (sk && !called.includes(sk)) called.push(sk);
            ctx.update({ log: `SKILL CALLED: ${sk}` });
          }
          ctx.update({ log: `> ${ev.name} ${String(ev.input.file_path ?? ev.input.skill ?? ev.input.pattern ?? "").slice(0, 120)}`.trim(), ...(generating ? { progress: Math.min(0.8, MARKS[1] as number + calls * 0.02) } : {}) });
        } else if (ev.kind === "text") generate();
        else if (ev.kind === "result") { answer = ev.text; ok = ev.ok; }
      }
    },
  });
  if (ctx.signal.aborted) throw new Error("Cancelled");
  if (!ok) throw new Error(`Claude reported an error: ${answer.slice(0, 300) || stderrLast || "unknown"}`);
  if (!answer) throw new Error(`Claude returned no answer. ${stderrLast || (code !== 0 ? `Exit code ${code}. Is it installed and signed in?` : "")}`.trim());

  ctx.update({ step: IDEAS_STEPS[2], stepIndex: 2, progress: MARKS[2], log: "Checking the answer" });
  const parsed = parseClaudeIdeas(answer, count);
  if (!parsed.ok) throw new Error(parsed.error);
  requireSkill(ctx, called.some((x) => REQUIRED_IDEA_SKILLS.includes(x)), "The AI did not call reel-hooks or reel-research, so the ideas are not skill-based. Check Settings > Content skills, then try again.");
  const skillsUsed = called;
  const withSources = normalizeSources(parsed.ideas, new Set(slugs));
  const { kept, dropped } = dedupeIdeas(existingQuestions(ctx.dataDir, brand), withSources.ideas);
  if (!kept.length) throw new Error(`All ${parsed.ideas.length} ideas repeat existing questions. Try again.`);
  const rules = ctx.settings.factory.closingRules;
  const id = newBatchId();
  const file = writeBatch(ctx.dataDir, {
    id, createdAt: new Date().toISOString(), brand, requested: count, handled: {}, skillsUsed, dropped, notes: withSources.notes,
    ideas: kept.map((i) => ({ ...i, id: questionId(i.question), closing: classifyClosing(i.question, i.source === "needs source" ? null : i.source, rules) })),
  });
  ctx.update({ step: IDEAS_STEPS[3], stepIndex: 3, progress: 1, log: [`Skills used: ${skillsUsed.join(", ")}`, `${kept.length} ideas written to ${file}`, ...dropped.map((d) => `Dropped: ${d.question} (${d.reason})`), ...withSources.notes] });
  return { batch: id, file, skillsUsed, proposed: kept.length, dropped: dropped.length, summary: `${kept.length} new ideas ready to review.` };
};
