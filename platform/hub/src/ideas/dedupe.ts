const FILLER = new Set(["a", "an", "the", "do", "does", "did", "you", "your", "is", "are", "was", "to", "of", "in", "on", "for", "and", "or", "it", "its", "that", "this", "with", "really", "actually", "s", "can", "will", "would", "what", "how", "why", "when", "who", "which"]);
const SIMILAR = 0.7;

export const normalizeQuestion = (q: string): string => q.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const tokens = (q: string): Set<string> => new Set(normalizeQuestion(q).split(" ").filter((w) => w && !FILLER.has(w)));

function similarity(a: string, b: string): number {
  const x = tokens(a), y = tokens(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const t of x) if (y.has(t)) both += 1;
  return both / (x.size + y.size - both);
}

/** Same question once punctuation and case are ignored, or nearly the same words. */
export const isDuplicate = (q: string, existing: readonly string[]): boolean =>
  existing.some((e) => normalizeQuestion(e) === normalizeQuestion(q) || similarity(e, q) >= SIMILAR);

export interface Dropped { question: string; reason: string }

/** Keeps the ideas that differ from every existing question and from each earlier idea. */
export function dedupeIdeas<T extends { question: string }>(existing: readonly string[], ideas: readonly T[]): { kept: T[]; dropped: Dropped[] } {
  const kept: T[] = [];
  const dropped: Dropped[] = [];
  for (const i of ideas) {
    if (isDuplicate(i.question, existing)) dropped.push({ question: i.question, reason: "Same as an existing question." });
    else if (isDuplicate(i.question, kept.map((k) => k.question))) dropped.push({ question: i.question, reason: "Same as another proposal." });
    else kept.push(i);
  }
  return { kept, dropped };
}
