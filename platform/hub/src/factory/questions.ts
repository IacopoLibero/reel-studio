import { createHash } from "node:crypto";

export type SourceKind = "blog" | "needs-source" | "other";
export interface Question {
  id: string;
  brand: string;
  question: string;
  hook: string | null;
  source: string | null;
  sourceKind: SourceKind;
  done: boolean;
  folder: string | null;
  closing: "A" | "B" | null;
  section: string;
}

export const questionId = (text: string): string => createHash("sha1").update(text.trim()).digest("hex").slice(0, 12);

const ITEM = /^- \[( |x|X)\]\s+(.*)$/;
const hookFromHeading = (h: string): string => (h.split(":")[0] ?? h).trim().split(/\s+/)[0]?.toLowerCase() ?? "";
const stripTicks = (s: string) => s.replace(/^`+|`+$/g, "").trim();

function sourceInfo(raw: string | null): { source: string | null; kind: SourceKind } {
  if (!raw) return { source: null, kind: "other" };
  const text = stripTicks(raw);
  if (/^needs source$/i.test(text)) return { source: text, kind: "needs-source" };
  return { source: text, kind: /^[a-z0-9]+(-[a-z0-9]+)+$/.test(text) && /^`.*`$/.test(raw.trim()) ? "blog" : "other" };
}

/** Parses brand/<brand>/reel-questions.md. Missing fields become null. */
export function parseQuestions(md: string, brand: string): Question[] {
  const out: Question[] = [];
  let heading = "";
  let top = "";
  for (const line of md.split("\n")) {
    if (line.startsWith("## ")) { top = line.slice(3).trim(); heading = ""; continue; }
    if (line.startsWith("### ")) { heading = line.slice(4).trim(); continue; }
    const m = ITEM.exec(line);
    if (!m) continue;
    const [question = "", ...fields] = (m[2] as string).split(" · ").map((s) => s.trim());
    let hook: string | null = heading ? hookFromHeading(heading) : null;
    let folder: string | null = null;
    let closing: "A" | "B" | null = null;
    let rawSource: string | null = null;
    for (const f of fields) {
      if (/^hook:/i.test(f)) hook = f.replace(/^hook:\s*/i, "").split(",")[0]?.trim() || hook;
      else if (/^closing\s+[AB]$/i.test(f)) closing = f.trim().slice(-1).toUpperCase() as "A" | "B";
      else if (/^source:/i.test(f)) rawSource = f.replace(/^source:\s*/i, "").trim();
      else if (/^`[^`]+`$/.test(f)) folder = stripTicks(f);
    }
    const { source, kind } = sourceInfo(rawSource);
    out.push({
      id: questionId(question), brand, question, hook, source, sourceKind: kind,
      done: m[1] !== " ", folder, closing, section: heading || top || "Questions",
    });
  }
  return out;
}

/** Ticks one to-do question, adds folder and closing, and moves its line to the end of the Done list. */
export function tickQuestion(md: string, question: string, folder: string, closing: "A" | "B"): string {
  const lines = md.split("\n");
  const q = parseQuestions(md, "").find((x) => x.question === question && !x.done);
  if (!q) return md;
  const idx = lines.findIndex((l) => { const m = ITEM.exec(l); return !!m && m[1] === " " && (m[2] as string).split(" · ")[0]?.trim() === question; });
  if (idx < 0) return md;
  const parts = [question, ...(q.hook ? [`hook: ${q.hook}`] : []), `\`${folder}\``, `closing ${closing}`];
  if (q.source) parts.push(`source: ${q.sourceKind === "blog" ? `\`${q.source}\`` : q.source}`);
  const newLine = `- [x] ${parts.join(" · ")}`;
  const rest = lines.filter((_, i) => i !== idx);
  const todo = rest.findIndex((l) => /^## To do/i.test(l));
  let lastDone = -1;
  rest.forEach((l, i) => { if ((todo < 0 || i < todo) && /^- \[[xX]\]/.test(l)) lastDone = i; });
  const at = lastDone >= 0 ? lastDone + 1 : todo >= 0 ? todo : rest.length;
  return [...rest.slice(0, at), newLine, ...rest.slice(at)].join("\n");
}
