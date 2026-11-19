import { createHash } from "node:crypto";
import { z } from "zod";
import { classifyClosing } from "../factory/classifier.js";
import { questionId } from "../factory/questions.js";
import type { ClosingRules } from "../factory/classifier.js";
import { dedupeIdeas } from "../ideas/dedupe.js";
import { extractJson, ideaSchema, NEEDS_SOURCE } from "../ideas/schema.js";
import { dailyIdeaSchema, proposalSchema, readoutSchema, type DailyIdea, type Proposal, type Readout } from "./types.js";

const raw = (text: string): unknown => { try { return extractJson(text); } catch { throw new Error(`Claude's answer was not valid JSON. Start of the answer: ${text.trim().slice(0, 160) || "(empty)"}`); } };
const issue = (e: z.ZodError, what: string) => `${what}: wrong shape at ${e.issues[0]?.path.join(".") || "root"}: ${e.issues[0]?.message ?? "invalid"}`;

const analysisOut = z.object({
  skillsUsed: z.array(z.string().max(80)).max(20).default([]),
  readout: readoutSchema,
  proposals: z.array(proposalSchema.omit({ id: true })).max(5).default([]),
});

export interface Analysis { readout: Readout; proposals: Proposal[]; skillsUsed: string[] }

/** Strict parse of the analysis answer. Proposals get a stable id from their title. */
export function parseAnalysis(text: string): Analysis {
  const r = analysisOut.safeParse(raw(text));
  if (!r.success) throw new Error(issue(r.error, "Analysis"));
  return { readout: r.data.readout, skillsUsed: r.data.skillsUsed, proposals: r.data.proposals.map((p) => ({ ...p, id: createHash("sha1").update(p.title).digest("hex").slice(0, 8) })) };
}

const ideasOut = z.object({
  skillsUsed: z.array(z.string().max(80)).max(20).default([]),
  ideas: z.array(ideaSchema.extend({ basedOnData: dailyIdeaSchema.shape.basedOnData, threads: z.string().trim().max(2000).nullable().default(null) })).min(1, "The list of ideas is empty."),
});

export interface IdeasParse { ideas: DailyIdea[]; skillsUsed: string[]; dropped: { question: string; reason: string }[]; notes: string[] }

/** Validates, repairs sources that are not real posts, drops repeats, and cuts to `count`. Throws when fewer than `count` survive. */
export function parseDailyIdeas(text: string, count: number, o: { slugs: ReadonlySet<string>; existing: readonly string[]; rules: ClosingRules }): IdeasParse {
  const r = ideasOut.safeParse(raw(text));
  if (!r.success) throw new Error(issue(r.error, "Ideas"));
  const notes: string[] = [];
  const fixed = r.data.ideas.map((i) => {
    if (i.source === NEEDS_SOURCE || o.slugs.has(i.source)) return i;
    notes.push(`Source "${i.source}" is not a blog post: marked as needs source.`);
    return { ...i, source: NEEDS_SOURCE };
  });
  const { kept, dropped } = dedupeIdeas(o.existing, fixed);
  if (kept.length < count) throw new Error(`Only ${kept.length} of ${count} ideas are new (${dropped.length} repeated existing questions). Run it again.`);
  const ideas = kept.slice(0, count).map((i): DailyIdea => ({
    ...i, id: questionId(i.question), closing: classifyClosing(i.question, i.source === NEEDS_SOURCE ? null : i.source, o.rules),
    threads: i.threads && i.threads.length <= 500 ? i.threads : null,
  }));
  return { ideas, skillsUsed: r.data.skillsUsed, dropped, notes };
}
