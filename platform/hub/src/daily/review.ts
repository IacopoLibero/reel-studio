import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSpec, JobRequestError } from "../jobs/create.js";
import { readScheduled, reelDirOf, resolveReelFile } from "../reels/scanner.js";
import type { Slot } from "../shared/types.js";
import { DailyError, type DailyDeps } from "./deps.js";
import { offerOf, humanDay } from "../brands/offer.js";
import { checkOffer, dropOfferLines, offerLines, slotAfterOffer } from "./offer.js";
import { canRerun, markDropped, markRerun, markScheduling, PlanError, readPlan, updatePlan } from "./plan.js";
import { suggestSlots, takenKeys } from "./slots.js";
import { MAX_RERUNS, type DailyPlan, type PlanReel } from "./types.js";

const planOf = (d: DailyDeps, date: string): DailyPlan => {
  const p = readPlan(d.config.dataDir, date);
  if (!p) throw new DailyError(`There is no plan for ${date}.`, 404);
  return p;
};
const reelOf = (p: DailyPlan, ideaId: string): PlanReel => {
  const r = p.reels.find((x) => x.ideaId === ideaId);
  if (!r) throw new DailyError("That reel is not in this plan.", 404);
  if (r.state !== "review") throw new DailyError(`This reel is ${r.state}, not waiting for review.`);
  return r;
};
const jobDeps = (d: DailyDeps) => ({ root: d.config.root, brand: d.brand, settings: d.settings.get(), jobs: d.store.list(), now: d.now() });
const readCaption = (d: DailyDeps, key: string): string => { const f = resolveReelFile(d.config.root, key, "caption"); return f ? readFileSync(f, "utf8") : ""; };

export interface SlotOptions {
  slots: Array<Slot & { offerExpired: boolean }>;
  recommended: Slot | null; bestTimeNote: string | null;
  closing: "A" | "B"; offerLines: string[];
}

/** Next free slots of the pattern, the best-time suggestion when the readout has one, and the offer lines still in the caption. */
export function slotOptions(d: DailyDeps, date: string, ideaId: string): SlotOptions {
  const plan = planOf(d, date);
  const reel = reelOf(plan, ideaId);
  const active = d.store.list().filter((j) => j.type === "instagram.schedule" && j.brand === d.brand.slug && (j.status === "queued" || j.status === "running")).map((j) => `${j.params.date} ${j.params.time}`);
  const taken = takenKeys(Object.values(readScheduled(join(d.config.dataDir, "scheduled.json"))).map((e) => e.at), active);
  const s = suggestSlots(d.settings.get().slotPattern, d.now(), taken, plan.readout?.bestTimes ?? []);
  const lines = reel.key ? offerLines(readCaption(d, reel.key), offerOf(d.brand.brand)) : [];
  return { slots: s.slots.map((x) => ({ ...x, offerExpired: slotAfterOffer(x.date, offerOf(d.brand.brand)) })), recommended: s.recommended, bestTimeNote: s.bestTimeNote, closing: reel.closing, offerLines: lines };
}

export interface ConfirmInput { date: string; time: string; dropOffer: boolean }

/** "Confirm": creates the instagram.schedule job for the chosen slot. With the offer expired the caption copy without it is sent; caption.md is never edited. */
export function confirmReel(d: DailyDeps, date: string, ideaId: string, c: ConfirmInput): DailyPlan {
  const plan = planOf(d, date);
  const reel = reelOf(plan, ideaId);
  if (!reel.key) throw new DailyError("This reel has no folder yet.");
  const caption = readCaption(d, reel.key);
  const cfg = offerOf(d.brand.brand);
  const offer = checkOffer(reel.closing, caption, c.date, cfg);
  if (offer.applies && !c.dropOffer) throw new DailyError(`${offer.message} Drop the offer line from the copy sent to Instagram, or choose a slot on or before ${cfg.lastDay ? humanDay(cfg.lastDay) : "the last day of the offer"}.`, 409, "offer_expired");
  try {
    const spec = buildSpec({ type: "instagram.schedule", params: { reel: reel.key, date: c.date, time: c.time } }, jobDeps(d));
    let params = spec.params ?? {};
    if (offer.applies) {
      const dir = reelDirOf(d.config.root, ...(reel.key.split("/") as [string, string]));
      writeFileSync(join(dir, "caption.instagram.md.tmp"), dropOfferLines(caption, cfg));
      renameSync(join(dir, "caption.instagram.md.tmp"), join(dir, "caption.instagram.md"));
      params = { ...params, captionFile: "caption.instagram.md" };
    }
    const job = d.store.create({ ...spec, params });
    d.runner.enqueue(job);
    return updatePlan(d.config.dataDir, date, (p) => markScheduling(p, ideaId, job.id, `${c.date} ${c.time}`, offer.applies, d.now()));
  } catch (e) {
    if (e instanceof JobRequestError) throw new DailyError(e.message);
    if (e instanceof PlanError) throw new DailyError(e.message);
    throw e;
  }
}

/** "Reject": reruns the reel with the note appended to the prompt (at most twice). */
export function rejectReel(d: DailyDeps, date: string, ideaId: string, note: string): DailyPlan {
  const clean = note.trim();
  if (clean.length < 3) throw new DailyError("Write what to change in a few words.", 400);
  const plan = planOf(d, date);
  const reel = reelOf(plan, ideaId);
  if (!reel.folder) throw new DailyError("This reel has no folder yet.");
  if (!canRerun(reel)) throw new DailyError(`This reel was already redone ${MAX_RERUNS} times: confirm it or discard it.`);
  try {
    const spec = buildSpec({ type: "reel.make", params: { questionId: ideaId, closing: reel.closing, rerun: { folder: reel.folder, note: clean } } }, jobDeps(d));
    const job = d.store.create(spec);
    d.runner.enqueue(job);
    return updatePlan(d.config.dataDir, date, (p) => markRerun(p, ideaId, job.id, clean, d.now()));
  } catch (e) {
    if (e instanceof JobRequestError || e instanceof PlanError) throw new DailyError(e.message);
    throw e;
  }
}

/** "Discard": the reel is left out for good (no schedule, no rerun). */
export function discardReel(d: DailyDeps, date: string, ideaId: string, note = ""): DailyPlan {
  reelOf(planOf(d, date), ideaId);
  return updatePlan(d.config.dataDir, date, (p) => markDropped(p, ideaId, note, d.now()));
}
