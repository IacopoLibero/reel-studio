import { requireSkill } from "../ai/agent.js";
import { toLocal } from "../calendar/merge.js";
import { bestTimeStats, parseSuggestions } from "../calendar/best-times.js";
import { questionId } from "../factory/questions.js";
import { questionsFile } from "../brands/paths.js";
import { readBrandQuestions } from "../factory/service.js";
import type { Handler } from "../jobs/handlers.js";
import { isDuplicate } from "../ideas/dedupe.js";
import { planSchema } from "../series/schema.js";
import { SeriesStore } from "../series/store.js";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { extractJson, runClaudeText } from "./claude-run.js";
import { cliRunner } from "./composio.js";
import { collectInto } from "./collector.js";
import type { Snapshot } from "./schemas.js";
import { insightsPrompt, seriesPrompt, suggestPrompt } from "./prompts.js";
import { analyticsDir, latestSnapshot, writeBestTimes, writeReadout } from "./store.js";

export const COLLECT_STEPS = ["Read posts", "Read insights", "Write files"];
export const INSIGHTS_STEPS = ["Read data", "Analyse", "Save readout"];
export const SERIES_STEPS = ["Read context", "Plan", "Check"];
export const SUGGEST_STEPS = ["Compute", "Suggest", "Save"];

const EMPTY_SNAPSHOT: Snapshot = { version: 1, collectedAt: new Date().toISOString(), igUserId: "", warnings: [], media: [] };

export const analyticsCollect: Handler = async (_job, ctx) => {
  ctx.update({ step: COLLECT_STEPS[0], stepIndex: 0, progress: 0.05 });
  let seen = 0;
  const out = await collectInto(cliRunner(), {
    root: ctx.root, brand: ctx.brand?.slug ?? "", dataDir: ctx.dataDir, igUserId: ctx.brand?.brand.instagram.userId ?? "", timezone: ctx.settings.slotPattern.timezone, delayMs: 250,
    onLog: (l) => { seen += 1; ctx.update({ log: l, step: l.startsWith("insights") ? COLLECT_STEPS[1] : COLLECT_STEPS[0], stepIndex: l.startsWith("insights") ? 1 : 0, progress: Math.min(0.9, 0.1 + seen * 0.12) }); },
  });
  ctx.update({ step: COLLECT_STEPS[2], stepIndex: 2, progress: 1, log: [`Snapshot ${out.snapshotPath}`, `Hooks ${out.csvPath}`] });
  return { ...out, summary: `${out.mediaCount} posts read from Instagram.` };
};

const csvRowCount = (file: string): number => { try { return Math.max(0, readFileSync(file, "utf8").trim().split("\n").length - 1); } catch { return 0; } };

export const reelInsights: Handler = async (job, ctx) => {
  const snap = latestSnapshot(ctx.dataDir);
  if (!snap) throw new Error("There is no analytics snapshot yet. Press Refresh on the Analytics page first.");
  const brand = ctx.brand?.slug ?? String(job.params.brand);
  const dir = analyticsDir(ctx.dataDir);
  const date = toLocal(new Date().toISOString(), ctx.settings.slotPattern.timezone).date;
  ctx.update({ step: INSIGHTS_STEPS[0], stepIndex: 0, progress: 0.1, log: `Snapshot of ${snap.collectedAt}, ${snap.media.length} posts` });
  const prompt = insightsPrompt({ root: ctx.root, brand, ...(ctx.brand ? { brandInfo: ctx.brand.brand } : {}), date: snap.collectedAt.slice(0, 10), csvRows: csvRowCount(join(dir, "hooks.csv")), snapshotPath: join(dir, `${toLocal(snap.collectedAt, ctx.settings.slotPattern.timezone).date}.json`), dir, questionsFile: questionsFile(ctx.dataDir), styleFile: join(ctx.dataDir, "identity", "style.md") });
  let step = false;
  const { answer, skills } = await runClaudeText(ctx, prompt, () => { if (!step) { step = true; ctx.update({ step: INSIGHTS_STEPS[1], stepIndex: 1, progress: 0.3 }); } });
  requireSkill(ctx, skills.includes("reel-insights"), `The AI did not call the reel-insights skill (called: ${skills.join(", ") || "none"}), so the readout is not skill-based. Check that the skill exists in .claude/skills.`);
  ctx.update({ step: INSIGHTS_STEPS[2], stepIndex: 2, progress: 0.95 });
  const file = writeReadout(ctx.dataDir, date, answer.trim());
  ctx.update({ progress: 1, log: `Readout saved to ${file}` });
  return { file, date, skills, summary: answer.trim().split("\n").slice(0, 3).join(" ").slice(0, 300) };
};

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export const seriesPlan: Handler = async (job, ctx) => {
  const brand = ctx.brand?.slug ?? String(job.params.brand);
  const focus = typeof job.params.focus === "string" ? job.params.focus : "";
  const store = new SeriesStore(join(ctx.dataDir, "series.json"));
  ctx.update({ step: SERIES_STEPS[0], stepIndex: 0, progress: 0.1 });
  const prompt = seriesPrompt({ root: ctx.root, brand, ...(ctx.brand ? { brandInfo: ctx.brand.brand } : {}), focus, existing: store.list().map((s) => s.name), hasData: !!latestSnapshot(ctx.dataDir), dir: analyticsDir(ctx.dataDir), questionsFile: questionsFile(ctx.dataDir), styleFile: join(ctx.dataDir, "identity", "style.md") });
  let step = false;
  const { answer, skills } = await runClaudeText(ctx, prompt, () => { if (!step) { step = true; ctx.update({ step: SERIES_STEPS[1], stepIndex: 1, progress: 0.3 }); } });
  requireSkill(ctx, skills.includes("series-planner"), `The AI did not call the series-planner skill (called: ${skills.join(", ") || "none"}).`);
  ctx.update({ step: SERIES_STEPS[2], stepIndex: 2, progress: 0.9 });
  let raw: unknown;
  try { raw = extractJson(answer); } catch (e) { throw new Error((e as Error).message, { cause: e }); }
  const plan = planSchema.safeParse(raw);
  if (!plan.success) throw new Error(`The series plan had the wrong shape at ${plan.error.issues[0]?.path.join(".") || "root"}: ${plan.error.issues[0]?.message}`);
  const known = new Map(readBrandQuestions(ctx.dataDir, brand).map((q) => [norm(q.question), q]));
  const matched = plan.data.questions.map((q) => known.get(norm(q))).filter((q): q is NonNullable<typeof q> => !!q);
  const dropped = plan.data.questions.length - matched.length;
  const fresh = plan.data.newQuestions.filter((q) => !isDuplicate(q, [...known.values()].map((k) => k.question)));
  const proposal = { ...plan.data, newQuestions: fresh, questionIds: matched.map((q) => questionId(q.question)), questions: matched.map((q) => q.question) };
  ctx.update({ progress: 1, log: [`Skills used: ${skills.join(", ")}`, ...(dropped ? [`${dropped} question(s) did not match the list and were dropped`] : [])] });
  return { proposal, skills, summary: `Proposed series: ${proposal.name}` };
};

export const scheduleSuggest: Handler = async (_job, ctx) => {
  const snap = latestSnapshot(ctx.dataDir);
  ctx.update({ step: SUGGEST_STEPS[0], stepIndex: 0, progress: 0.1 });
  const stats = bestTimeStats(snap ?? EMPTY_SNAPSHOT, ctx.settings.slotPattern.timezone, ctx.settings.slotPattern);
  const at = new Date().toISOString();
  if (!stats.enough) {
    const out = { at, enough: false, message: stats.message, reelsUsed: stats.reelsUsed, suggestions: [], defaults: stats.defaults, basedOn: "", note: "" };
    writeBestTimes(ctx.dataDir, out);
    ctx.update({ step: SUGGEST_STEPS[2], stepIndex: 2, progress: 1, log: stats.message });
    return { ...out, summary: stats.message };
  }
  ctx.update({ step: SUGGEST_STEPS[1], stepIndex: 1, progress: 0.3, log: `${stats.reelsUsed} reels used` });
  const { answer, skills } = await runClaudeText(ctx, suggestPrompt({ root: ctx.root, ...(ctx.brand ? { brandInfo: ctx.brand.brand } : {}), stats, timezone: ctx.settings.slotPattern.timezone }));
  requireSkill(ctx, skills.includes("best-time-scheduler"), `The AI did not call the best-time-scheduler skill (called: ${skills.join(", ") || "none"}).`);
  const parsed = parseSuggestions(answer);
  if (!parsed.ok) throw new Error(parsed.error);
  const out = { at, enough: true, message: stats.message, reelsUsed: stats.reelsUsed, defaults: stats.defaults, ...parsed.value };
  writeBestTimes(ctx.dataDir, out);
  ctx.update({ step: SUGGEST_STEPS[2], stepIndex: 2, progress: 1 });
  return { ...out, skills, summary: `${out.suggestions.length} suggested times from ${out.reelsUsed} reels.` };
};
