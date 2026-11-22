export const STEPS = ["Reading the code", "Writing the move", "Registering it", "Rendering with Blender", "Summary"] as const;

export type StreamEvent =
  | { kind: "init"; model: string; sessionId?: string }
  | { kind: "text"; text: string }
  | { kind: "tool"; name: string; input: Record<string, unknown> }
  | { kind: "result"; ok: boolean; text: string; cost: number | null };

/** One line of `claude -p --output-format stream-json` to zero or more events. Unknown lines are ignored. */
export function parseStreamLine(line: string): StreamEvent[] {
  const t = line.trim();
  if (!t) return [];
  let o: Record<string, any>;
  try { o = JSON.parse(t); } catch { return []; }
  if (!o || typeof o !== "object") return [];
  if (o.type === "system" && o.subtype === "init") return [{ kind: "init", model: String(o.model ?? ""), ...(typeof o.session_id === "string" && o.session_id ? { sessionId: o.session_id } : {}) }];
  if (o.type === "result") {
    const ok = o.is_error !== true && (o.subtype === undefined || o.subtype === "success");
    return [{ kind: "result", ok, text: typeof o.result === "string" ? o.result : String(o.subtype ?? ""), cost: typeof o.total_cost_usd === "number" ? o.total_cost_usd : null }];
  }
  if (o.type === "assistant" && Array.isArray(o.message?.content)) {
    const out: StreamEvent[] = [];
    for (const c of o.message.content) {
      if (c?.type === "text" && typeof c.text === "string") out.push({ kind: "text", text: c.text });
      else if (c?.type === "tool_use") out.push({ kind: "tool", name: String(c.name), input: (c.input ?? {}) as Record<string, unknown> });
    }
    return out;
  }
  return [];
}

export interface StreamState {
  stepIndex: number;
  step: string;
  rendering: boolean;
  finished: boolean;
  failed: boolean;
  summary: string;
  logs: string[];
}

export const initialStreamState = (): StreamState => ({ stepIndex: 0, step: STEPS[0] as string, rendering: false, finished: false, failed: false, summary: "", logs: [] });

const isRender = (cmd: string) => /blender-run|org\.blender\.Blender|blender\s/.test(cmd);
const short = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n)}…` : s);

function toolStep(name: string, input: Record<string, unknown>): number | null {
  const path = String(input.file_path ?? "");
  if (name === "Bash") return isRender(String(input.command ?? "")) ? 3 : null;
  if (name === "Edit" || name === "Write") {
    if (path.endsWith("Mascot.tsx")) return 2;
    if (/\/mascot\/[a-z0-9_-]+\.py$/.test(path)) return 1;
  }
  return null;
}

function describe(e: StreamEvent): string[] {
  if (e.kind === "text") return e.text.split("\n").filter((l) => l.trim()).map((l) => short(l));
  if (e.kind === "tool") {
    const arg = e.input.file_path ?? e.input.command ?? e.input.pattern ?? "";
    return [`> ${e.name} ${short(String(arg), 120)}`.trim()];
  }
  return [];
}

/** Pure reducer: step only moves forward; the render step is flagged so the caller can count PNG files. */
export function reduceStream(s: StreamState, e: StreamEvent): StreamState {
  const logs = [...s.logs, ...describe(e)];
  if (e.kind === "tool") {
    const idx = toolStep(e.name, e.input);
    const stepIndex = idx !== null && idx > s.stepIndex ? idx : s.stepIndex;
    return { ...s, logs, stepIndex, step: STEPS[stepIndex] as string, rendering: stepIndex === 3 && !s.finished };
  }
  if (e.kind === "result") {
    const stepIndex = STEPS.length - 1;
    return { ...s, logs, finished: true, failed: !e.ok, rendering: false, stepIndex, step: STEPS[stepIndex], summary: e.text };
  }
  return { ...s, logs };
}
