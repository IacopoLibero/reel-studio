import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { questionsFile } from "../brands/paths.js";
import { withFileLock } from "../factory/allocator.js";
import { questionId } from "../factory/questions.js";
import { appendIdeas } from "../ideas/append.js";
import { NEEDS_SOURCE } from "../ideas/schema.js";

/**
 * Adds the new episodes of a series to the brand's question list (under To do, hook "curiosity", source "needs source")
 * and returns the ids of those that are in the list afterwards, in the order given.
 */
export async function addEpisodeQuestions(brandDir: string, brand: string, questions: readonly string[]): Promise<string[]> {
  if (!questions.length) return [];
  return withFileLock(join(brandDir, "locks", `questions-${brand}.lock`), async () => {
    const file = questionsFile(brandDir);
    const out = appendIdeas(readFileSync(file, "utf8"), questions.map((question) => ({ question, hook: "curiosity" as const, source: NEEDS_SOURCE })));
    if (out.added.length) { writeFileSync(`${file}.tmp`, out.md); renameSync(`${file}.tmp`, file); }
    // A question that was already in the list keeps its own id: only the ones that were added (or are the same text) count.
    return questions.filter((q) => out.added.includes(q)).map(questionId);
  });
}
