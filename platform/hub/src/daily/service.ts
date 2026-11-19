import { join } from "node:path";
import { withFileLock } from "../factory/allocator.js";
import { buildSpec, JobRequestError } from "../jobs/create.js";
import { appendIdeas } from "../ideas/append.js";
import { questionsPath } from "../ideas/service.js";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { checkConnectivity, heavyActive, startDailyLoop, todayIn } from "./gate.js";
import { DailyError, type DailyDeps } from "./deps.js";
import { DAILY_STEPS } from "./run-handler.js";
import { listPlanDates, newPlan, PlanError, readPlan, reconcile, isTerminal, transition, updatePlan, writePlan } from "./plan.js";
import type { DailyPlan, PlanReel } from "./types.js";

const tz = (d: DailyDeps) => d.settings.get().slotPattern.timezone;
export const todayOf = (d: DailyDeps) => todayIn(d.now(), tz(d));

/** Creates (or, after a failure, resets) the plan for `date` and starts its daily.run job. The plan is on disk before the job exists. */
export function startRun(d: DailyDeps, date: string): DailyPlan {
  const existing = readPlan(d.config.dataDir, date);
  if (existing && existing.status !== "failed") throw new DailyError(`There is already a plan for ${date} (${existing.status}).`);
  const now = d.now();
  writePlan(d.config.dataDir, existing ? transition(existing, "collecting", { error: null, warnings: [], step: "", progress: 0 }, now) : newPlan(date, now));
  const job = d.store.create({ type: "daily.run", brand: d.brand.slug, title: `Daily run ${date}`, steps: DAILY_STEPS, params: { date } });
  const plan = updatePlan(d.config.dataDir, date, (p) => ({ ...p, jobId: job.id }));
  d.runner.enqueue(job);
  return plan;
}

/** Brings the stored plans in line with their jobs. Cheap: only plans that are not finished. */
export function reconcilePlans(d: DailyDeps): void {
  for (const date of listPlanDates(d.config.dataDir).slice(0, 7)) {
    const p = readPlan(d.config.dataDir, date);
    if (!p || isTerminal(p.status)) continue;
    try { updatePlan(d.config.dataDir, date, (cur) => reconcile(cur, d.store.list(), d.now())); } catch { /* a plan mid-edit: next change retries */ }
  }
}

const approving = new Set<string>();

/** "Create selected": the chosen ideas go to the To do list (same lock and format as the Factory) and one reel.make job each starts. */
export async function approve(d: DailyDeps, date: string, picks: ReadonlyArray<{ ideaId: string; closing: "A" | "B" }>): Promise<DailyPlan> {
  const dataDir = d.config.dataDir;
  const plan = readPlan(dataDir, date);
  if (!plan) throw new DailyError(`There is no plan for ${date}.`, 404);
  if (plan.status !== "awaiting_approval") throw new DailyError(`This plan is ${plan.status}; nothing can be created now.`);
  if (approving.has(date)) throw new DailyError("Already creating this plan.");
  const chosen = picks.map((p) => ({ ...p, idea: plan.ideas.find((i) => i.id === p.ideaId) })).filter((x): x is typeof x & { idea: NonNullable<typeof x.idea> } => !!x.idea);
  if (!chosen.length) throw new DailyError("Select at least one idea.", 400);
  approving.add(date);
  try {
    await withFileLock(join(dataDir, "locks", `questions-${d.brand.slug}.lock`), async () => {
      const file = questionsPath(d.config.root, d.brand.slug);
      const out = appendIdeas(readFileSync(file, "utf8"), chosen.map((c) => ({ question: c.idea.question, hook: c.idea.hook, source: c.idea.source })));
      if (out.added.length) { writeFileSync(`${file}.tmp`, out.md); renameSync(`${file}.tmp`, file); }
    });
    const reels = chosen.map((c): PlanReel => {
      const base = { ideaId: c.idea.id, question: c.idea.question, closing: c.closing, folder: null, key: null, reruns: 0, note: "", scheduleJobId: null, slot: null, offerDropped: false };
      try {
        const spec = buildSpec({ type: "reel.make", params: { questionId: c.idea.id, closing: c.closing } }, { root: d.config.root, brand: d.brand, settings: d.settings.get(), jobs: d.store.list() });
        const job = d.store.create(spec);
        d.runner.enqueue(job);
        return { ...base, jobId: job.id, state: "making", error: null };
      } catch (e) {
        if (!(e instanceof JobRequestError)) throw e;
        return { ...base, jobId: null, state: "failed", error: e.message };
      }
    });
    return updatePlan(dataDir, date, (p) => reconcile(transition({ ...p, reels }, "creating", {}, d.now()), d.store.list(), d.now()));
  } finally { approving.delete(date); }
}

/** "Skip today": nothing is created. */
export function skip(d: DailyDeps, date: string): DailyPlan {
  try { return updatePlan(d.config.dataDir, date, (p) => transition(p, "skipped", {}, d.now())); } catch (e) {
    if (e instanceof PlanError) throw new DailyError(e.message);
    throw e;
  }
}

/** The hub-side loop: every 5 minutes, when on, after the earliest time, with no plan for today, no heavy job and a working connection. */
export function startDaily(d: DailyDeps, fetchFn: typeof fetch = fetch): { stop: () => void; tick: () => Promise<unknown> } {
  const off = d.store.onChange((j) => { if (j.status === "done" || j.status === "failed" || j.status === "cancelled") reconcilePlans(d); });
  const loop = startDailyLoop({
    now: d.now, getDaily: () => d.settings.get().daily, timezone: () => tz(d),
    hasPlan: (date) => readPlan(d.config.dataDir, date) !== null,
    heavy: () => heavyActive(d.store.list()),
    online: () => checkConnectivity(fetchFn),
    trigger: (date) => { startRun(d, date); },
    log: (m) => console.log(`[daily ${d.brand.slug}] ${m}`),
  });
  reconcilePlans(d);
  return { tick: loop.tick, stop: () => { loop.stop(); off(); } };
}

