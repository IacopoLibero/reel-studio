import type { TimeStats } from "../calendar/best-times.js";
import { audienceOf, languageName, type BrandInfo } from "../brands/wording.js";

const HEADINGS_IT = ["Come sta andando", "Da ripetere", "Da smettere", "Hook che hanno funzionato", "Proposte", "Proposta:"] as const;
const HEADINGS_EN = ["How it is going", "To repeat", "To stop", "Hooks that worked", "Proposals", "Proposal:"] as const;

export function insightsPrompt(o: { root: string; brand: string; brandInfo?: BrandInfo; date: string; csvRows: number; snapshotPath: string; dir: string }): string {
  const lang = o.brandInfo?.readoutLanguage ?? "en";
  const h = lang.startsWith("it") ? HEADINGS_IT : HEADINGS_EN;
  return `You write the plain-language readout of the Instagram results of the ${o.brand} reels in the reel-studio project at ${o.root}. You only read and think: do not write or edit files and do not run commands. The hub saves your answer.

You MUST call the Skill tool with the skill "reel-insights" first (a real Skill tool call, not a mention), and follow it.${o.csvRows >= 8 ? ` hooks.csv has ${o.csvRows} rows, so also call the skill "ootto-hook-mining" on it.` : ` hooks.csv has only ${o.csvRows} rows: do not call hook-mining, say the sample is small.`}

Read:
- ${o.snapshotPath} (newest snapshot, collected ${o.date}; older ones are in the same folder: ${o.dir}/<date>.json)
- ${o.dir}/hooks.csv (hook, plays, reach, saves, shares, likes, comments, posted_at, reel)
- brand/${o.brand}/style.md and brand/${o.brand}/reel-questions.md (the hook of each reel, the closing A or B)
A reel with insights "too_early" is too new to judge: say "too early", never call it a flop. A missing metric is not zero: say it is missing.

Produce, in plain ${languageName(lang)} for the person who runs the brand (short sentences, no jargon), exactly this layout in Markdown:
${h[0]}: 2 lines
${h[1]}: up to 3 bullets, each with the real number
${h[2]}: up to 3 bullets, each with the real number
${h[3]}: the pattern and one example (the hook text stays in the reel's own language)
${h[4]}: 1 to 3 bullets, each starting with "${h[5]}" and the why. Proposals are only proposals.
Answer with the Markdown only.`;
}

export function seriesPrompt(o: { root: string; brand: string; brandInfo?: BrandInfo; focus: string; existing: string[]; hasData: boolean; dir: string }): string {
  return `You propose one new recurring reel series for the ${o.brand} brand in the reel-studio project at ${o.root}. You only read and think: do not write or edit files and do not run commands.

You MUST call the Skill tool, in this order: "series-planner" (the series design) then "reel-hooks" (the example hooks as strong opening questions). Real Skill tool calls, not mentions.

Read: brand/${o.brand}/style.md, brand/${o.brand}/reel-questions.md (all questions, done and to do)${o.hasData ? `, ${o.dir}/hooks.csv and the newest ${o.dir}/<date>.json (what won and flopped)` : " (no analytics data yet: say nothing about results)"}.
Series that already exist (do not repeat them): ${o.existing.join("; ") || "none"}.
${o.focus ? `The person who runs the brand asks for this focus: ${o.focus}\n` : ""}Rules:
- A named, repeatable format ${audienceOf(o.brandInfo)} would follow so as not to miss one: a short name, a one-line promise, a cadence (for example "weekly"), 3 to 5 example hooks written as opening questions.
- "questions": copy EXACTLY, character for character, between 3 and 8 existing questions from reel-questions.md that fit the series (done or to do).
- "why": one line, using the real numbers when data exists.
Answer with JSON only, no text around it:
{"name":"...","promise":"...","cadence":"...","exampleHooks":["..."],"questions":["..."],"why":"..."}`;
}

export function suggestPrompt(o: { root: string; brandInfo?: BrandInfo; stats: TimeStats; timezone: string }): string {
  return `You suggest the best posting times for the Instagram reels of ${o.brandInfo?.name ?? "a brand"}, from its real data. You only think: do not read other files, write files or run commands.

You MUST call the Skill tool with the skill "best-time-scheduler" first (a real Skill tool call) and follow its honesty rule: never present a generic best time as if it came from the data.

Real data (time zone ${o.timezone}), computed from ${o.stats.reelsUsed} reels with plays at least two days old:
By posting hour (average plays, reach, saves): ${JSON.stringify(o.stats.byHour)}
By weekday (average plays): ${JSON.stringify(o.stats.byDay)}
The slot pattern the brand already uses (do not change it, only compare): ${JSON.stringify(o.stats.defaults)}
Give 3 to 5 suggestions, each a weekday name or "Any day", a time HH:MM that exists in the data or in the pattern, and a one-line why with the real numbers. Say in "basedOn" how many reels this rests on and that it is a small sample if it is. Keep claims modest.
Answer with JSON only: {"basedOn":"...","note":"...","suggestions":[{"day":"Tue","time":"17:30","why":"..."}]}`;
}
