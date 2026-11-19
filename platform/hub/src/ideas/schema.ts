import { z } from "zod";

export const IDEA_HOOKS = ["fear", "curiosity", "myth", "money", "effort", "identity", "proof", "number"] as const;
export type IdeaHook = (typeof IDEA_HOOKS)[number];

export const MAX_IDEAS = 30;
export const countSchema = z.coerce.number().int().min(1, "Ask for at least 1 idea.").max(MAX_IDEAS, `Ask for at most ${MAX_IDEAS} ideas.`).default(10);

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)+$/;
export const NEEDS_SOURCE = "needs source";

export const ideaSchema = z.object({
  question: z.string().trim().min(10, "A question is too short.").max(200, "A question is too long.").refine((q) => !/[\r\n]/.test(q), "A question must be one line."),
  hook: z.enum(IDEA_HOOKS),
  why: z.string().trim().min(5, "Each idea needs a why.").max(240).refine((q) => !/[\r\n]/.test(q), "why must be one line."),
  sourceSupports: z.string().trim().min(3, "Each idea needs sourceSupports.").max(300).refine((q) => !/[\r\n]/.test(q), "sourceSupports must be one line."),
  source: z.string().trim().refine((s) => s === NEEDS_SOURCE || SLUG.test(s), `source must be a blog slug or "${NEEDS_SOURCE}"`),
});
export type Idea = z.infer<typeof ideaSchema>;

const outputSchema = z.object({ skillsUsed: z.array(z.string().max(80)).max(20).default([]), ideas: z.array(ideaSchema).min(1, "The list of ideas is empty.") });

export type ParseResult = { ok: true; ideas: Idea[]; skillsUsed: string[] } | { ok: false; error: string };

/** Finds the JSON object in Claude's answer: the whole text, a code fence, or the outermost braces. */
export function extractJson(text: string): unknown {
  const t = text.trim();
  const candidates = [t, /```(?:json)?\s*([\s\S]*?)```/i.exec(t)?.[1], t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)];
  for (const c of candidates) {
    if (!c) continue;
    try { return JSON.parse(c.trim()); } catch { /* try the next */ }
  }
  throw new Error("no JSON");
}

/** Strict validation of the answer. Extra ideas beyond `count` are cut. */
export function parseClaudeIdeas(text: string, count: number): ParseResult {
  let raw: unknown;
  try { raw = extractJson(text); } catch { return { ok: false, error: `Claude's answer was not valid JSON. Start of the answer: ${text.trim().slice(0, 160) || "(empty)"}` }; }
  const r = outputSchema.safeParse(raw);
  if (!r.success) {
    const i = r.error.issues[0];
    return { ok: false, error: `Claude's JSON had the wrong shape at ${i?.path.join(".") || "root"}: ${i?.message ?? "invalid"}` };
  }
  return { ok: true, ideas: r.data.ideas.slice(0, count), skillsUsed: r.data.skillsUsed };
}

/** A slug that is not a real blog post becomes "needs source", so nothing claims support it does not have. */
export function normalizeSources(ideas: Idea[], slugs: ReadonlySet<string>): { ideas: Idea[]; notes: string[] } {
  const notes: string[] = [];
  const out = ideas.map((i) => {
    if (i.source === NEEDS_SOURCE || slugs.has(i.source)) return i;
    notes.push(`Source "${i.source}" is not a blog post: marked as needs source.`);
    return { ...i, source: NEEDS_SOURCE };
  });
  return { ideas: out, notes };
}
