import { questionId } from "../factory/questions.js";
import type { Series } from "./schema.js";

export interface SeriesRef { id: string; name: string }

/** Which series a reel folder belongs to: the folder of a question that is in the series. Keyed by the bare folder name. */
export function seriesByFolder(questions: readonly { question: string; folder: string | null }[], series: readonly Series[]): Map<string, SeriesRef> {
  const byQuestion = new Map<string, SeriesRef>();
  for (const s of series) for (const q of s.questionIds) byQuestion.set(q, { id: s.id, name: s.name });
  const out = new Map<string, SeriesRef>();
  for (const q of questions) {
    const ref = byQuestion.get(questionId(q.question));
    if (ref && q.folder) out.set(q.folder.split("/").pop() ?? q.folder, ref);
  }
  return out;
}
