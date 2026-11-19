export interface ClosingRules { product: string[]; general: string[] }

/**
 * Closing A (the brand offer and website) when the question is about something the product offers,
 * closing B (Follow for tips) for general advice, regulation and operations.
 * A trailing * in a keyword means "any word starting with this"; otherwise whole words and phrases only.
 */
export const DEFAULT_RULES: ClosingRules = {
  product: [
    "qr", "digital menu", "paper menu", "printed menu", "reprint*", "print*", "menu price*", "price*", "translate", "translation",
    "kitchen screen*", "kitchen display*", "display system", "order mistakes", "order errors", "wrong order*",
    "set up", "setup", "app", "paper", "going digital", "go digital", "2010",
  ],
  general: [
    "allerg*", "rules", "law", "laws", "regulation*", "review*", "google", "marketing", "staff*", "rota",
    "lunch rush", "tourist*", "languages", "number of",
  ],
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function matcher(keyword: string): RegExp {
  const prefix = keyword.endsWith("*");
  const body = escape(prefix ? keyword.slice(0, -1) : keyword.trim()).replace(/\s+/g, "[\\s-]+");
  return new RegExp(`(^|[^a-z0-9])${body}${prefix ? "" : "($|[^a-z0-9])"}`, "i");
}

const hits = (text: string, list: string[]): number => list.filter((k) => k.trim() && matcher(k).test(text)).length;

/**
 * Deterministic choice. The question text decides first (product keywords beat general ones);
 * the source slug only decides when the question matches nothing. Ties and no match give B.
 */
export function classifyClosing(question: string, source: string | null, rules: ClosingRules = DEFAULT_RULES): "A" | "B" {
  if (hits(question, rules.product) > 0) return "A";
  if (hits(question, rules.general) > 0) return "B";
  const src = (source ?? "").replace(/[-_]/g, " ");
  const p = hits(src, rules.product);
  const g = hits(src, rules.general);
  return p > g ? "A" : "B";
}
