import { z } from "zod";

const oneLine = (max: number) => z.string().trim().max(max).refine((s) => !/[\r\n]/.test(s), "Use one line.");
export const QUESTION_ID = /^[0-9a-f]{12}$/;

export const seriesInput = z.object({
  name: oneLine(80).pipe(z.string().min(2, "Give the series a name.")),
  promise: oneLine(300).default(""),
  cadence: oneLine(80).default(""),
  exampleHooks: z.array(oneLine(200).pipe(z.string().min(1))).max(8).default([]),
  questionIds: z.array(z.string().regex(QUESTION_ID)).max(100).default([]),
});
export type SeriesInput = z.infer<typeof seriesInput>;

export const seriesSchema = seriesInput.extend({ id: z.string().regex(/^[0-9a-f]{12}$/), createdAt: z.string() });
export type Series = z.infer<typeof seriesSchema>;

export const seriesFile = z.object({ series: z.array(seriesSchema) });
export const fromPlanBody = seriesInput.pick({ name: true, promise: true, cadence: true, exampleHooks: true }).extend({
  questionIds: z.array(z.string().regex(QUESTION_ID)).max(40).default([]),
  newQuestions: z.array(oneLine(240).pipe(z.string().min(10))).max(40).default([]),
});
export const assignBody = z.object({ questionIds: z.array(z.string().regex(QUESTION_ID)).max(100) });

/** What the series.plan job asks Claude to answer with. */
export const planSchema = z.object({
  name: oneLine(80).pipe(z.string().min(2)),
  promise: oneLine(300),
  cadence: oneLine(80),
  exampleHooks: z.array(oneLine(200)).min(1).max(8),
  questions: z.array(oneLine(240)).max(40).default([]),
  /** Episodes that are not in the question list yet (a run such as one video a day for 30 days). */
  newQuestions: z.array(oneLine(240).pipe(z.string().min(10))).max(40).default([]),
  why: oneLine(400).default(""),
});
export type Plan = z.infer<typeof planSchema>;
