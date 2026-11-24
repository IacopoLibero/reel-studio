import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { questionsFile } from "../brands/paths.js";
import { withFileLock } from "../factory/allocator.js";
import { appendIdeas } from "./append.js";
import { isDuplicate } from "./dedupe.js";
import { knownIdeas } from "./known.js";
import { readBatch, writeBatch, type IdeaBatch, type StoredIdea } from "./store.js";

/** Where the brand's question list is: reel-questions.md in the brand's data folder. */
export const questionsPath = questionsFile;

/** True when the brand (given by its data folder) has a question list. */
export function brandExists(dataDir: string): boolean {
  return existsSync(questionsPath(dataDir));
}

/** Every idea the brand already has, to refuse a repeat: the question list (done ones included), the reels and carousels made, and the hooks that were posted. */
export const existingQuestions = (dataDir: string, _brand: string): string[] => knownIdeas(dataDir);

/** Blog post slugs: the .ts files in the posts folder that are not the index or the translations. */
export function blogSlugs(blogDir: string): string[] {
  try { return readdirSync(blogDir).filter((f) => f.endsWith(".ts") && !["index.ts", "translations.ts"].includes(f)).map((f) => f.slice(0, -3)).sort(); } catch { return []; }
}

/** Which optional data the brand folder holds, so the prompt only names the skills that have something to read. */
export function brandData(brandDir: string): { hasCsv: boolean; hasComments: boolean; hasResults: boolean } {
  const dir = brandDir;
  let files: string[] = [];
  try { files = readdirSync(dir); } catch { /* no folder */ }
  return { hasCsv: files.some((f) => f.toLowerCase().endsWith(".csv")), hasComments: files.some((f) => /^comments\./i.test(f)), hasResults: files.includes("instagram-results.md") };
}

export interface ResolveResult { added: string[]; skipped: { question: string; reason: string }[]; rejected: number }

/** Appends the accepted ideas to the To do list under the same lock the factory uses, then records what happened in the batch file. */
export async function resolveBatch(root: string, dataDir: string, batchId: string, accept: string[], reject: string[]): Promise<ResolveResult | null> {
  const first = readBatch(dataDir, batchId);
  if (!first) return null;
  const lock = join(dataDir, "locks", `questions-${first.brand}.lock`);
  return withFileLock(lock, async () => {
    const batch = readBatch(dataDir, batchId) as IdeaBatch;
    const open = (ids: string[]) => batch.ideas.filter((i) => ids.includes(i.id) && !batch.handled[i.id]);
    const toAdd: StoredIdea[] = open(accept);
    const toReject = open(reject.filter((r) => !accept.includes(r)));
    let result: ResolveResult = { added: [], skipped: [], rejected: toReject.length };
    if (toAdd.length) {
      const file = questionsPath(dataDir);
      const out = appendIdeas(readFileSync(file, "utf8"), toAdd);
      if (out.added.length) { writeFileSync(`${file}.tmp`, out.md); renameSync(`${file}.tmp`, file); }
      result = { ...result, added: out.added, skipped: out.skipped };
    }
    const handled = { ...batch.handled };
    for (const i of toAdd) handled[i.id] = result.added.includes(i.question) ? "added" : "skipped";
    for (const i of toReject) handled[i.id] = "rejected";
    writeBatch(dataDir, { ...batch, handled });
    return result;
  });
}

/** Ideas still waiting for a decision, flagged when the question list now already has them. */
export function pendingView(root: string, dataDir: string, batches: IdeaBatch[]) {
  return batches.map((b) => ({ b, existing: brandExists(dataDir) ? existingQuestions(dataDir, b.brand) : [] })).map(({ b, existing }) => ({
    id: b.id, createdAt: b.createdAt, brand: b.brand, requested: b.requested, dropped: b.dropped.length, notes: b.notes, skillsUsed: b.skillsUsed,
    ideas: b.ideas.filter((i) => !b.handled[i.id]).map((i) => ({ ...i, duplicate: isDuplicate(i.question, existing) })),
  })).filter((b) => b.ideas.length > 0);
}
