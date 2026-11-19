import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ideaSchema } from "./schema.js";

export const BATCH_ID = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;
const stored = ideaSchema.extend({ id: z.string(), closing: z.enum(["A", "B"]) });
export const batchSchema = z.object({
  id: z.string().regex(BATCH_ID),
  createdAt: z.string(),
  brand: z.string(),
  requested: z.number(),
  ideas: z.array(stored),
  dropped: z.array(z.object({ question: z.string(), reason: z.string() })),
  notes: z.array(z.string()),
  skillsUsed: z.array(z.string()).default([]),
  handled: z.record(z.string(), z.enum(["added", "rejected", "skipped"])),
});
export type StoredIdea = z.infer<typeof stored>;
export type IdeaBatch = z.infer<typeof batchSchema>;

export const ideasDir = (dataDir: string) => join(dataDir, "ideas");
export const newBatchId = (d = new Date()): string => d.toISOString().replace(/[:.]/g, "-");

/** Writes data/ideas/<id>.json atomically. */
export function writeBatch(dataDir: string, batch: IdeaBatch): string {
  const dir = ideasDir(dataDir);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${batch.id}.json`);
  writeFileSync(`${file}.tmp`, JSON.stringify(batch, null, 2));
  renameSync(`${file}.tmp`, file);
  return file;
}

export function readBatch(dataDir: string, id: string): IdeaBatch | null {
  if (!BATCH_ID.test(id)) return null;
  try { return batchSchema.parse(JSON.parse(readFileSync(join(ideasDir(dataDir), `${id}.json`), "utf8"))); } catch { return null; }
}

/** Newest first. Files that do not parse are ignored. */
export function listBatches(dataDir: string, limit = 10): IdeaBatch[] {
  let names: string[] = [];
  try { names = readdirSync(ideasDir(dataDir)); } catch { return []; }
  return names.filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -5)).filter((id) => BATCH_ID.test(id)).sort().reverse().slice(0, limit)
    .map((id) => readBatch(dataDir, id)).filter((b): b is IdeaBatch => b !== null);
}
