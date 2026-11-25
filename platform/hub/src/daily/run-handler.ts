import { requireSkill } from "../ai/agent.js";
import type { Handler } from "../jobs/handlers.js";
import { productDir } from "../ideas/prompt.js";
import { blogSlugs, brandData, existingQuestions } from "../ideas/service.js";
import { collectViaAdapter, hooksRows } from "./analytics.js";
import { runClaude } from "./claude.js";
import { NotificationStore } from "./notifications.js";
import { parseAnalysis, parseDailyIdeas } from "./parse.js";
import { readPlan, transition, updatePlan, writePlan } from "./plan.js";
import { buildAnalysePrompt, buildDailyIdeasPrompt } from "./prompts.js";
import { scheduleSuggest } from "../analytics/handlers.js";
import { readBestTimes } from "../analytics/store.js";
import { REQUIRED_SKILLS, type DailyPlan } from "./types.js";

export const DAILY_STEPS = ["Collect", "Analyse", "Ideas", "Waiting for you"];
const MARKS = [0.05, 0.3, 0.6, 1];

/** Skills that must have been called for the ideas to count as skill-based (reel-hooks or reel-research). */
export const skillGateOk = (called: readonly string[]): boolean => called.includes("reel-hooks") || called.includes("reel-research");

/** daily.run: collect, analyse, ideas, then the plan waits for the user. The rest of the pipeline is driven by the user's clicks. */
type Collect = typeof collectViaAdapter;

export const makeDailyRun = (collectFn: Collect = collectViaAdapter): Handler => async (job, ctx) => {
  const date = String(job.params.date);
  const brand = ctx.brand?.slug;
  if (!brand) throw new Error("The daily run needs a brand.");
  const save = (fn: (p: DailyPlan) => DailyPlan) => updatePlan(ctx.dataDir, date, fn);
  const plan = readPlan(ctx.dataDir, date);
  if (!plan || plan.status !== "collecting") throw new Error(`The plan for ${date} is not ready to run (${plan?.status ?? "missing"}).`);
  const step = (i: number, log?: string) => {
    ctx.update({ step: DAILY_STEPS[i], stepIndex: i, progress: MARKS[i], ...(log ? { log } : {}) });
    save((p) => ({ ...p, step: DAILY_STEPS[i] as string, progress: MARKS[i] as number, updatedAt: new Date().toISOString() }));
  };
  try {
    step(0, `Daily run for ${date}`);
    const collect = await collectFn({ root: ctx.root, brand, dataDir: ctx.dataDir, igUserId: ctx.brand?.brand.instagram.userId ?? "", timezone: ctx.settings.slotPattern.timezone });
    ctx.update({ log: collect.note });
    save((p) => transition({ ...p, collect }, "analysing", { warnings: collect.ok ? p.warnings : [...p.warnings, collect.note] }));

    step(1);
    // best-time-scheduler: refresh the saved best times when they are older than a day, so the slots proposed below use them.
    const saved = readBestTimes(ctx.dataDir);
    if (!saved || Date.now() - Date.parse(saved.at) > 24 * 3600 * 1000) {
      try {
        const quiet = { ...ctx, update: (u: Parameters<typeof ctx.update>[0]) => ctx.update(u && "log" in u ? { log: u.log } : {}) } as typeof ctx;
        await scheduleSuggest(job, quiet);
        ctx.update({ log: "Best times refreshed (best-time-scheduler)." });
      } catch (e) {
        if (ctx.signal.aborted) throw e;
        ctx.update({ log: `Best times not refreshed: ${(e as Error).message.slice(0, 200)}` });
      }
    }
    const rows = hooksRows(ctx.dataDir);
    let readout: DailyPlan["readout"] = null;
    let proposals: DailyPlan["proposals"] = [];
    const used = new Set<string>();
    const warnings: string[] = [];
    try {
      const a = parseAnalysis((await runClaude(ctx, buildAnalysePrompt({ root: ctx.root, brand, ...(ctx.brand ? { brandInfo: ctx.brand.brand } : {}), dataDir: ctx.dataDir, date, hooksRows: rows }))).answer);
      readout = a.readout; proposals = a.proposals; a.skillsUsed.forEach((s) => used.add(s));
    } catch (e) {
      if (ctx.signal.aborted) throw e;
      warnings.push(`The analysis failed (${(e as Error).message.slice(0, 200)}); the ideas use what is on disk.`);
      ctx.update({ log: warnings[0] as string });
    }
    save((p) => transition({ ...p, readout, proposals }, "ideas", { warnings: [...p.warnings, ...warnings] }));

    step(2);
    const settings = ctx.settings.daily;
    const slugs = blogSlugs(ctx.blogDir);
    const prompt = buildDailyIdeasPrompt({ root: ctx.root, brand, ...(ctx.brand ? { brandInfo: ctx.brand.brand } : {}), dataDir: ctx.dataDir, count: settings.ideas, blogDir: ctx.blogDir, slugs, hooksRows: rows, hasResults: brandData(ctx.dataDir).hasResults, readout, threads: settings.threads });
    const run = await runClaude(ctx, prompt, [ctx.blogDir, productDir(ctx.blogDir)]);
    run.called.forEach((s) => used.add(s));
    requireSkill(ctx, skillGateOk(run.called), "The AI did not call reel-hooks or reel-research, so the ideas are not skill-based.");
    const parsed = parseDailyIdeas(run.answer, settings.ideas, { slugs: new Set(slugs), existing: existingQuestions(ctx.dataDir, brand), rules: ctx.settings.factory.closingRules });
    const missing = REQUIRED_SKILLS.filter((s) => !used.has(s));
    ctx.update({ log: [`Skills used: ${[...used].join(", ")}`, ...parsed.dropped.map((d) => `Dropped: ${d.question} (${d.reason})`), ...parsed.notes] });

    const note = NotificationStore.at(ctx.dataDir).add({ kind: "daily", brand, title: `Reel Hub, ${ctx.brand?.brand.name ?? brand}: ${parsed.ideas.length} new reel ideas`, body: parsed.ideas.map((i) => i.question).join("\n"), url: `/#/${brand}/daily` });
    save((p) => transition({ ...p, ideas: parsed.ideas, skillsUsed: [...used], skillsMissing: missing, notificationId: note.id, warnings: [...p.warnings, ...parsed.notes] }, "awaiting_approval"));
    step(3, "Waiting for your approval on the Daily page");
    return { date, ideas: parsed.ideas.length, summary: `${parsed.ideas.length} ideas wait for approval.` };
  } catch (e) {
    const msg = (e as Error).message;
    const cur = readPlan(ctx.dataDir, date);
    if (cur && cur.status !== "failed" && cur.status !== "awaiting_approval") {
      try { writePlan(ctx.dataDir, transition(cur, "failed", { error: msg })); } catch { /* already terminal */ }
    }
    throw e;
  }
};

export const dailyRun: Handler = makeDailyRun();
