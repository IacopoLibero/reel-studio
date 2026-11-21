import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FactoryQuestion, Job, Settings } from "../shared/types.js";
import { questionsFile } from "../brands/paths.js";
import { readScheduled, scanReels } from "../reels/scanner.js";
import { classifyClosing } from "./classifier.js";
import { parseQuestions, type Question } from "./questions.js";

/** Every question of one brand's reel-questions.md (in its data folder), parsed on each call. Empty when the brand has no list. */
export function readBrandQuestions(dataDir: string, brand: string): Question[] {
  const file = questionsFile(dataDir);
  return existsSync(file) ? parseQuestions(readFileSync(file, "utf8"), brand) : [];
}

export const activeMakeJobs = (jobs: Job[]) => jobs.filter((j) => j.type === "reel.make" && (j.status === "queued" || j.status === "running"));

/** Every question of the brand, joined with its reel folder on disk, its schedule state and the automatic closing. */
export function listFactoryQuestions(brand: string, dataDir: string, settings: Settings, jobs: Job[]): FactoryQuestion[] {
  const reels = new Map(scanReels(join(dataDir, "reels"), brand, readScheduled(join(dataDir, "scheduled.json"))).map((r) => [r.key, r]));
  const making = new Set(activeMakeJobs(jobs).map((j) => String(j.params.questionId)));
  return readBrandQuestions(dataDir, brand).map((q) => {
    const r = q.folder ? reels.get(`${q.brand}/${q.folder}`) : undefined;
    return {
      ...q,
      autoClosing: classifyClosing(q.question, q.source, settings.factory.closingRules),
      reel: r ? { hasMp4: !!r.mp4, hasCaption: r.hasCaption, hasCover: r.hasCover, schedule: r.schedule } : null,
      making: making.has(q.id),
    };
  });
}
