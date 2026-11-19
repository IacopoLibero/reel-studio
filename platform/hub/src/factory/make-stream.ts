import type { StreamEvent } from "../character/claude-stream.js";

export const MAKE_STEPS = ["Script", "Voice", "Plan", "Build", "Render", "Checks", "Caption", "Cover", "Done"] as const;
export const MAKE_MARKS = [0.03, 0.1, 0.2, 0.3, 0.45, 0.75, 0.85, 0.92, 1];

export type MakeEvent = StreamEvent | { kind: "files"; present: string[] };

export interface MakeState {
  stepIndex: number;
  step: string;
  finished: boolean;
  failed: boolean;
  summary: string;
  lastError: string;
  logs: string[];
}

export const initialMakeState = (): MakeState => ({ stepIndex: 0, step: MAKE_STEPS[0], finished: false, failed: false, summary: "", lastError: "", logs: [] });

const short = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n)}…` : s);

function toolStep(name: string, input: Record<string, unknown>): number | null {
  const path = String(input.file_path ?? "");
  const cmd = String(input.command ?? "");
  if (name === "Write" || name === "Edit") {
    if (path.endsWith("script.json")) return 1;
    if (path.endsWith("plan.md")) return 2;
    if (path.endsWith("caption.md")) return 6;
    if (path.endsWith("cover.json")) return 7;
    if (/\/src\/.*\.tsx?$/.test(path)) return 3;
    return null;
  }
  if (name === "Bash") {
    if (/remotion\s+still|cover\.png/.test(cmd)) return 7;
    if (/voice\.mjs|slot\.sh\s+voice/.test(cmd)) return 1;
    if (/remotion\s+render|slot\.sh\s+render/.test(cmd)) return 4;
    if (/ffmpeg|ffprobe/.test(cmd)) return 5;
  }
  return null;
}

/** Step that the files on disk say we have reached (a file present means its step is done). */
function fileStep(present: string[]): number {
  let s = 0;
  const has = (f: string | RegExp) => present.some((p) => (typeof f === "string" ? p === f : f.test(p)));
  if (has("script.json")) s = 1;
  if (has(/-props\.json$/)) s = 2;
  if (has("plan.md")) s = 3;
  if (has(/\.mp4$/)) s = 5;
  if (has("caption.md")) s = 7;
  if (has("cover.png")) s = 8;
  return s;
}

const describe = (e: MakeEvent): string[] => {
  if (e.kind === "text") return e.text.split("\n").filter((l) => l.trim()).map((l) => short(l));
  if (e.kind === "tool") return [`> ${e.name} ${short(String(e.input.file_path ?? e.input.command ?? e.input.pattern ?? ""), 120)}`.trim()];
  return [];
};

/** Pure reducer: the step only moves forward, driven by tool calls and by files that appear. */
export function reduceMake(s: MakeState, e: MakeEvent): MakeState {
  const logs = [...s.logs, ...describe(e)];
  const at = (i: number) => { const stepIndex = Math.max(s.stepIndex, i); return { stepIndex, step: MAKE_STEPS[stepIndex] as string }; };
  if (e.kind === "files") return { ...s, ...at(fileStep(e.present)), logs };
  if (e.kind === "tool") { const i = toolStep(e.name, e.input); return { ...s, ...(i === null ? {} : at(i)), logs }; }
  if (e.kind === "result") {
    return { ...s, logs, finished: true, failed: !e.ok, summary: e.text, lastError: e.ok ? s.lastError : e.text || s.lastError, ...at(MAKE_STEPS.length - 1) };
  }
  if (e.kind === "text") return { ...s, logs, lastError: /error|fail|cannot|could not/i.test(e.text) ? short(e.text.split("\n")[0] ?? "", 200) : s.lastError };
  return { ...s, logs };
}

export function missingOutputs(present: string[]): string[] {
  const out: string[] = [];
  if (!present.some((p) => p.toLowerCase().endsWith(".mp4"))) out.push("mp4");
  if (!present.includes("caption.md")) out.push("caption.md");
  if (!present.includes("cover.png")) out.push("cover.png");
  return out;
}
