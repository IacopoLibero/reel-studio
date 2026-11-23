import type { StreamEvent } from "../character/claude-stream.js";

/** The `Skill` tool of Claude has no twin in Codex: a skill is used when its SKILL.md is read, so a command that mentions one is reported as that skill. */
const SKILL_PATH = /(?:^|[\s/"'])skills\/([a-z0-9][a-z0-9_-]*)\/(?:SKILL\.md|[A-Za-z0-9._-]+\.md)/;

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Turns the lines of `codex exec --json` (JSON Lines: thread.started, turn.started, item.started, item.completed, turn.completed, turn.failed, error)
 * into the events the jobs already understand (the same ones `claude -p --output-format stream-json` gives). One parser per run: it remembers the last
 * agent message, which becomes the result when the turn completes. Unknown lines and unknown item types are ignored.
 */
export function createCodexParser(): (line: string) => StreamEvent[] {
  let last = "";
  let started = false;
  return (line) => {
    const t = line.trim();
    if (!t) return [];
    let o: Record<string, unknown>;
    try { o = asRecord(JSON.parse(t)); } catch { return []; }
    const type = str(o.type);
    if (type === "thread.started") { started = true; return [{ kind: "init", model: "", ...(str(o.thread_id) ? { sessionId: str(o.thread_id) } : {}) }]; }
    if (type === "turn.completed") return [{ kind: "result", ok: true, text: last, cost: null }];
    if (type === "turn.failed") return [{ kind: "result", ok: false, text: str(asRecord(o.error).message) || str(o.message) || "The turn failed.", cost: null }];
    if (type === "error") return started ? [] : [{ kind: "result", ok: false, text: str(o.message) || "Codex reported an error.", cost: null }];
    if (type !== "item.started" && type !== "item.completed") return [];
    const item = asRecord(o.item);
    const kind = str(item.type);
    if (kind === "agent_message" && type === "item.completed") { last = str(item.text); return last ? [{ kind: "text", text: last }] : []; }
    if (type !== "item.started") return [];
    if (kind === "command_execution") {
      const command = str(item.command);
      const skill = SKILL_PATH.exec(command)?.[1];
      return [{ kind: "tool", name: "Bash", input: { command } }, ...(skill ? [{ kind: "tool" as const, name: "Skill", input: { skill } }] : [])];
    }
    if (kind === "file_change") {
      const changes = Array.isArray(item.changes) ? item.changes.map(asRecord) : [];
      return changes.length ? changes.map((c) => ({ kind: "tool" as const, name: str(c.kind) === "add" ? "Write" : "Edit", input: { file_path: str(c.path) } })) : [{ kind: "tool", name: "Edit", input: { file_path: "" } }];
    }
    if (kind === "web_search") return [{ kind: "tool", name: "WebSearch", input: { query: str(item.query) } }];
    if (kind === "mcp_tool_call") return [{ kind: "tool", name: `${str(item.server)}.${str(item.tool)}`, input: asRecord(item.arguments) }];
    return [];
  };
}
