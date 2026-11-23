import type { BrandCtx } from "../brands/context.js";
import { z } from "zod";
import { classifyClosing } from "../factory/classifier.js";
import { activeMakeJobs, readBrandQuestions } from "../factory/service.js";
import { IDEAS_STEPS } from "../ideas/handler.js";
import { analyticsJobSchemas, analyticsSpec, AnalyticsJobError } from "../analytics/jobs.js";
import { brandExists } from "../ideas/service.js";
import { countSchema } from "../ideas/schema.js";
import { validMoveName } from "../character/moves-parser.js";
import { CHARACTER_STEPS } from "../creator/character-job.js";
import { readState, sheetFile } from "../creator/studio.js";
import { MOVES_STEPS } from "../creator/moves-job.js";
import { minutesAhead, MIN_LEAD_MINUTES } from "../slots.js";
import { folderOfKey, readScheduled, reelDirOf, resolveReelFile, scanReels } from "../reels/scanner.js";
import type { Job, Settings } from "../shared/types.js";
import type { JobSpec } from "./store.js";
import { basename } from "node:path";

export const SCHEDULE_STEPS = ["Open dialog", "Upload video", "Crop 9:16", "Upload cover", "Caption", "Date and time", "Schedule", "Verify"];

const move = z.string().refine(validMoveName, "Use a name like high_five: lowercase letters, digits and underscores.");

export const createSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("instagram.schedule"), params: z.object({
    reel: z.string().max(200), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  }) }),
  z.object({ type: z.literal("reel.make"), params: z.object({ questionId: z.string().regex(/^[0-9a-f]{12}$/), closing: z.enum(["A", "B"]).optional(), rerun: z.object({ folder: z.string().regex(/^\d+-[a-z0-9-]+$/), note: z.string().trim().min(1).max(1000) }).optional() }) }),
  z.object({ type: z.literal("reel.edit"), params: z.object({ folder: z.string().regex(/^\d+-[A-Za-z0-9._-]+$/).max(120), message: z.string().trim().min(1, "Write what to change.").max(4000) }) }),
  z.object({ type: z.literal("daily.run"), params: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }) }),
  z.object({ type: z.literal("reel.ideas"), params: z.object({ count: countSchema }).default(() => ({ count: 10 })) }),
  z.object({ type: z.literal("claude.task"), params: z.object({ request: z.string().trim().min(5, "Describe the move in a few words.").max(4000), move }) }),
  z.object({ type: z.literal("blender.render"), params: z.object({ move }) }),
  z.object({ type: z.literal("character.build"), params: z.object({ notes: z.string().trim().max(1000).optional() }).default({}) }),
  z.object({ type: z.literal("character.moves"), params: z.object({}).default({}) }),
  ...analyticsJobSchemas,
]);
export type CreateBody = z.infer<typeof createSchema>;

export class JobRequestError extends Error {}

/** `brand` is the brand the job is for: its data folder, questions and reels. */
export interface Deps { root: string; brand: BrandCtx; settings: Settings; jobs: Job[]; now?: Date }

export const MAKE_JOB_STEPS = ["Script", "Voice", "Plan", "Build", "Render", "Checks", "Caption", "Cover", "Done"];

function makeSpec(p: { questionId: string; closing?: "A" | "B"; rerun?: { folder: string; note: string } }, d: Deps): JobSpec {
  const q = readBrandQuestions(d.brand.paths.dataDir, d.brand.slug).find((x) => x.id === p.questionId);
  if (!q) throw new JobRequestError("That question is not in the list any more.");
  if (q.done && !p.rerun) throw new JobRequestError("A reel for this question is already made.");
  if (activeMakeJobs(d.jobs).some((j) => j.params.questionId === q.id)) throw new JobRequestError("This question is already in the factory.");
  const closing = p.closing ?? classifyClosing(q.question, q.source, d.settings.factory.closingRules);
  const short = q.question.length > 70 ? `${q.question.slice(0, 70)}…` : q.question;
  return {
    type: "reel.make", brand: d.brand.slug, title: `Reel: ${short}`, steps: MAKE_JOB_STEPS,
    params: { questionId: q.id, brand: q.brand, question: q.question, closing, source: q.source, sourceKind: q.sourceKind, ...(p.rerun ? { rerunFolder: p.rerun.folder, note: p.rerun.note } : {}) },
  };
}

function ideasSpec(p: { count: number }, d: Deps): JobSpec {
  if (!brandExists(d.brand.paths.dataDir)) throw new JobRequestError("That brand has no reel-questions.md.");
  if (d.jobs.some((j) => j.type === "reel.ideas" && j.brand === d.brand.slug && (j.status === "queued" || j.status === "running"))) throw new JobRequestError("Ideas are already being generated.");
  return { type: "reel.ideas", brand: d.brand.slug, title: `Find ${p.count} new ideas`, steps: IDEAS_STEPS, params: { count: p.count, brand: d.brand.slug } };
}

export const EDIT_JOB_STEPS = ["Reading the reel", "Changing it", "Rendering", "Checks", "Done"];

function editSpec(p: { folder: string; message: string }, d: Deps): JobSpec {
  const reel = scanReels(d.brand.paths.reelsDir, d.brand.slug, {}).find((r) => r.folder === p.folder);
  if (!reel) throw new JobRequestError("That reel was not found.");
  const mine = d.jobs.filter((j) => j.brand === d.brand.slug && (j.status === "queued" || j.status === "running"));
  if (mine.some((j) => j.type === "reel.edit" && j.params.folder === p.folder)) throw new JobRequestError("A change to this reel is already running. Wait for it to finish.");
  if (mine.some((j) => j.type === "instagram.schedule" && j.params.reel === `${d.brand.slug}/${p.folder}`)) throw new JobRequestError("This reel is being scheduled on Instagram right now. Try again when that is done.");
  const short = p.message.length > 60 ? `${p.message.slice(0, 60)}…` : p.message;
  return { type: "reel.edit", brand: d.brand.slug, title: `Reel ${reel.n}: ${short}`, steps: EDIT_JOB_STEPS, params: { folder: p.folder, message: p.message } };
}

export function buildSpec(body: CreateBody, d: Deps): JobSpec {
  if (body.type === "reel.edit") return editSpec(body.params, d);
  if (body.type === "reel.make") return makeSpec(body.params, d);
  if (body.type === "daily.run") throw new JobRequestError("The daily run is started from the Daily page.");
  if (body.type === "reel.ideas") return ideasSpec(body.params, d);
  if (body.type === "analytics.collect" || body.type === "reel.insights" || body.type === "series.plan" || body.type === "schedule.suggest") {
    try { return analyticsSpec(body, { root: d.root, dataDir: d.brand.paths.dataDir, jobs: d.jobs, brand: d.brand.slug }); } catch (e) { throw e instanceof AnalyticsJobError ? new JobRequestError(e.message) : e; }
  }
  if (body.type === "character.build") {
    if (!sheetFile(d.brand.paths.brandDir)) throw new JobRequestError("Upload the reference sheet first.");
    if (d.jobs.some((j) => j.type === "character.build" && j.brand === d.brand.slug && (j.status === "queued" || j.status === "running"))) throw new JobRequestError("A character build is already running for this brand.");
    return { type: body.type, brand: d.brand.slug, title: `Build the character (experimental)${body.params.notes ? ": with your notes" : ""}`, steps: CHARACTER_STEPS, params: body.params };
  }
  if (body.type === "character.moves") {
    const status = readState(d.brand.paths.brandDir).status;
    if (status !== "approved" && status !== "built") throw new JobRequestError("Approve a preview first.");
    if (d.jobs.some((j) => j.type === "character.moves" && j.brand === d.brand.slug && (j.status === "queued" || j.status === "running"))) throw new JobRequestError("The moves are already being made for this brand.");
    return { type: body.type, brand: d.brand.slug, title: "Make the character's moves (experimental)", steps: MOVES_STEPS, params: body.params };
  }
  if (body.type === "claude.task") {
    return { type: body.type, brand: d.brand.slug, title: `Add ${d.brand.brand.character.name || "character"} move: ${body.params.move}`, steps: ["Reading the code", "Writing the move", "Registering it", "Rendering with Blender", "Summary"], params: body.params };
  }
  if (body.type === "blender.render") {
    return { type: body.type, brand: d.brand.slug, title: `Re-render ${d.brand.brand.character.name || "character"} move: ${body.params.move}`, steps: ["Rendering with Blender"], params: body.params };
  }
  return scheduleSpec(body.params, d);
}

function scheduleSpec(p: { reel: string; date: string; time: string }, d: Deps): JobSpec {
  const scheduled = readScheduled(d.brand.paths.scheduledFile);
  const reel = scanReels(d.brand.paths.reelsDir, d.brand.slug, scheduled).find((r) => r.key === p.reel);
  if (!reel) throw new JobRequestError("That reel was not found.");
  if (!reel.mp4 || !reel.hasCaption || !reel.hasCover) throw new JobRequestError("The reel needs an MP4, a caption and a cover before it can be scheduled.");
  if (reel.schedule) throw new JobRequestError(`This reel is already scheduled for ${reel.schedule.at}.`);
  const active = d.jobs.filter((j) => j.type === "instagram.schedule" && j.brand === d.brand.slug && (j.status === "queued" || j.status === "running"));
  if (active.some((j) => j.params.reel === p.reel)) throw new JobRequestError("This reel is already waiting in the queue.");
  if (active.some((j) => j.params.date === p.date && j.params.time === p.time) || Object.values(scheduled).some((e) => e.at === `${p.date} ${p.time}`)) {
    throw new JobRequestError("Another reel already uses that slot.");
  }
  const tz = d.settings.slotPattern.timezone;
  if (minutesAhead(p.date, p.time, tz, d.now ?? new Date()) < MIN_LEAD_MINUTES) throw new JobRequestError(`Instagram needs the time to be at least ${MIN_LEAD_MINUTES} minutes ahead.`);
  const folder = folderOfKey(p.reel);
  const file = (k: "mp4") => resolveReelFile(d.brand.paths.reelsDir, folder, k) as string;
  const day = new Date(`${p.date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
  return {
    type: "instagram.schedule", brand: d.brand.slug, title: `Reel ${reel.n} · ${day} ${p.time}`, steps: SCHEDULE_STEPS,
    params: { reel: p.reel, date: p.date, time: p.time, slot: `${p.date}T${p.time}`, reelDir: reelDirOf(d.brand.paths.reelsDir, folder), video: basename(file("mp4")), timezone: tz },
  };
}
