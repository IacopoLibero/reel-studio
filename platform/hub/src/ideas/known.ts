import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { questionsFile } from "../brands/paths.js";
import { parseQuestions } from "../factory/questions.js";

const readJson = (file: string): unknown => { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; } };
const dirs = (dir: string): string[] => { try { return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; } };
const words = (folder: string): string => folder.replace(/^\d+-/, "").replace(/-(2d|3d)$/, "").replace(/-/g, " ");

/** The first spoken line of a reel: its opening question. */
function firstSentence(script: unknown): string | null {
  const list = (script as { sentences?: unknown })?.sentences;
  if (!Array.isArray(list) || !list.length) return null;
  const first = list[0];
  if (typeof first === "string") return first;
  const text = (first as { text?: unknown })?.text;
  return typeof text === "string" ? text : null;
}

function csvHooks(file: string): string[] {
  try {
    return readFileSync(file, "utf8").split("\n").slice(1).map((l) => (l.startsWith('"') ? l.slice(1, l.indexOf('",')) : l.split(",")[0]).trim()).filter(Boolean);
  } catch { return []; }
}

/** The ideas the brand already has in any form: its question list, every reel made (posted, scheduled or not), every carousel, and every hook with results (series questions are in the question list). */
export function knownIdeas(brandDir: string): string[] {
  const out: string[] = [];
  if (existsSync(questionsFile(brandDir))) out.push(...parseQuestions(readFileSync(questionsFile(brandDir), "utf8"), "").map((q) => q.question));
  for (const folder of dirs(join(brandDir, "reels"))) {
    out.push(words(folder));
    const first = firstSentence(readJson(join(brandDir, "reels", folder, "script.json")));
    if (first) out.push(first);
  }
  for (const folder of dirs(join(brandDir, "carousels"))) {
    out.push(words(folder));
    const c = readJson(join(brandDir, "carousels", folder, "carousel.json")) as { topic?: unknown; title?: unknown } | null;
    for (const t of [c?.topic, c?.title]) if (typeof t === "string" && t.trim()) out.push(t);
  }
  out.push(...csvHooks(join(brandDir, "analytics", "hooks.csv")));
  return out;
}
