import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { withFileLock } from "../factory/allocator.js";
import { parseQuestions } from "../factory/questions.js";
import { appendIdeas } from "./append.js";
import { isDuplicate } from "./dedupe.js";
import { readBatch, writeBatch, type IdeaBatch, type StoredIdea } from "./store.js";

const SAFE_BRAND = /^[A-Za-z0-9_-]+$/;
export const questionsPath = (root: string, brand: string) => join(root, "brand", brand, "reel-questions.md");

export function brandExists(root: string, brand: string): boolean {
  return SAFE_BRAND.test(brand) && existsSync(questionsPath(root, brand));
}

/** Every question of the brand, done ones included. */
export const existingQuestions = (root: string, brand: string): string[] =>
  parseQuestions(readFileSync(questionsPath(root, brand), "utf8"), brand).map((q) => q.question);

/** Blog post slugs: the .ts files in the posts folder that are not the index or the translations. */
export function blogSlugs(blogDir: string): string[] {
  try { return readdirSync(blogDir).filter((f) => f.endsWith(".ts") && !["index.ts", "translations.ts"].includes(f)).map((f) => f.slice(0, -3)).sort(); } catch { return []; }
}

/** Which optional data the brand folder holds, so the prompt only names the skills that have something to read. */
export function brandData(root: string, brand: string): { hasCsv: boolean; hasComments: boolean; hasResults: boolean } {
  const dir = join(root, "brand", brand);
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
      const file = questionsPath(root, batch.brand);
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
  return batches.map((b) => ({ b, existing: brandExists(root, b.brand) ? existingQuestions(root, b.brand) : [] })).map(({ b, existing }) => ({
    id: b.id, createdAt: b.createdAt, brand: b.brand, requested: b.requested, dropped: b.dropped.length, notes: b.notes, skillsUsed: b.skillsUsed,
    ideas: b.ideas.filter((i) => !b.handled[i.id]).map((i) => ({ ...i, duplicate: isDuplicate(i.question, existing) })),
  })).filter((b) => b.ideas.length > 0);
}
