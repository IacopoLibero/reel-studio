import { parseQuestions } from "../factory/questions.js";
import { isDuplicate } from "./dedupe.js";
import { NEEDS_SOURCE, type Idea, type IdeaHook } from "./schema.js";

export const HOOK_HEADINGS: Record<IdeaHook, string> = {
  fear: "Fear: what you could lose",
  curiosity: "Curiosity: a gap to close",
  myth: "Myth: a belief to break",
  money: "Money and time",
  effort: "Effort: how easy it is",
  identity: "Identity: what kind of owner you are",
  proof: "Proof: what others do",
  number: "Number: a clear list or count",
};

const headingHook = (h: string): string => (h.split(":")[0] ?? h).trim().split(/\s+/)[0]?.toLowerCase() ?? "";
const isBlank = (l: string) => l.trim() === "";

export const ideaLine = (i: Pick<Idea, "question" | "source">): string => {
  const q = i.question.replace(/\s*·\s*/g, ", ").replace(/\s+/g, " ").trim();
  return `- [ ] ${q} · source: ${i.source === NEEDS_SOURCE ? NEEDS_SOURCE : `\`${i.source}\``}`;
};

/** Index after the last non-blank line in [from, to). */
const endOfContent = (lines: string[], from: number, to: number): number => {
  let at = to;
  while (at > from && isBlank(lines[at - 1] as string)) at -= 1;
  return at;
};

export interface AppendResult { md: string; added: string[]; skipped: { question: string; reason: string }[] }

/** Adds each idea as `- [ ]` under the `### <Hook>` heading of the To do section, creating the heading (and the section) if missing. Duplicates are skipped. */
export function appendIdeas(md: string, ideas: ReadonlyArray<Pick<Idea, "question" | "hook" | "source">>): AppendResult {
  let lines = md.split("\n");
  const known = parseQuestions(md, "").map((q) => q.question);
  const added: string[] = [];
  const skipped: AppendResult["skipped"] = [];
  for (const idea of ideas) {
    if (isDuplicate(idea.question, known)) { skipped.push({ question: idea.question, reason: "Already in the question list." }); continue; }
    let todo = lines.findIndex((l) => /^## To do/i.test(l));
    if (todo < 0) {
      const end = endOfContent(lines, 0, lines.length);
      lines = [...lines.slice(0, end), "", "## To do", "", ...lines.slice(end)];
      todo = end + 1;
    }
    let sectionEnd = lines.findIndex((l, i) => i > todo && l.startsWith("## "));
    if (sectionEnd < 0) sectionEnd = lines.length;
    const heading = lines.findIndex((l, i) => i > todo && i < sectionEnd && l.startsWith("### ") && headingHook(l.slice(4)) === idea.hook);
    const line = ideaLine(idea);
    if (heading >= 0) {
      let next = lines.findIndex((l, i) => i > heading && i < sectionEnd && l.startsWith("### "));
      if (next < 0) next = sectionEnd;
      const at = endOfContent(lines, heading + 1, next);
      lines = [...lines.slice(0, at), line, ...lines.slice(at)];
    } else {
      const at = endOfContent(lines, todo + 1, sectionEnd);
      lines = [...lines.slice(0, at), "", `### ${HOOK_HEADINGS[idea.hook]}`, line, ...lines.slice(at)];
    }
    known.push(idea.question);
    added.push(idea.question);
  }
  let out = lines.join("\n");
  if (added.length && !out.endsWith("\n")) out += "\n";
  return { md: added.length ? out : md, added, skipped };
}
