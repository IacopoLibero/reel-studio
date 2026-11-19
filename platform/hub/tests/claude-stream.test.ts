import { describe, it, expect } from "vitest";
import { parseStreamLine, initialStreamState, reduceStream, STEPS } from "../src/character/claude-stream.js";

const line = (o: unknown) => JSON.stringify(o);
const tool = (name: string, input: Record<string, unknown>) =>
  line({ type: "assistant", message: { content: [{ type: "tool_use", name, input }] } });

describe("parseStreamLine", () => {
  it("parses init, text, tool_use and result", () => {
    expect(parseStreamLine(line({ type: "system", subtype: "init", model: "m" }))).toEqual([{ kind: "init", model: "m" }]);
    expect(parseStreamLine(line({ type: "assistant", message: { content: [{ type: "text", text: "Hi" }] } }))).toEqual([{ kind: "text", text: "Hi" }]);
    expect(parseStreamLine(tool("Read", { file_path: "/a" }))).toEqual([{ kind: "tool", name: "Read", input: { file_path: "/a" } }]);
    expect(parseStreamLine(line({ type: "result", subtype: "success", is_error: false, result: "done", total_cost_usd: 0.1 })))
      .toEqual([{ kind: "result", ok: true, text: "done", cost: 0.1 }]);
    expect(parseStreamLine(line({ type: "result", subtype: "error_max_turns", is_error: true }))).toEqual([{ kind: "result", ok: false, text: "error_max_turns", cost: null }]);
  });
  it("ignores blanks, garbage and tool results", () => {
    expect(parseStreamLine("")).toEqual([]);
    expect(parseStreamLine("nope")).toEqual([]);
    expect(parseStreamLine(line({ type: "user", message: { content: [] } }))).toEqual([]);
    expect(parseStreamLine(line({ type: "assistant", message: { content: "x" } }))).toEqual([]);
  });
});

describe("reduceStream", () => {
  it("walks the steps", () => {
    let s = initialStreamState();
    expect(s.stepIndex).toBe(0);
    s = reduceStream(s, { kind: "tool", name: "Read", input: { file_path: "/x/mascot/buddy.py" } });
    expect(s.stepIndex).toBe(0);
    s = reduceStream(s, { kind: "tool", name: "Edit", input: { file_path: "/x/mascot/buddy.py" } });
    expect(s.stepIndex).toBe(1);
    s = reduceStream(s, { kind: "tool", name: "Edit", input: { file_path: "/x/src/mascot/Mascot.tsx" } });
    expect(s.stepIndex).toBe(2);
    s = reduceStream(s, { kind: "tool", name: "Bash", input: { command: "blender-run -b -P /x/mascot/buddy.py -- move hop" } });
    expect(s.stepIndex).toBe(3);
    expect(s.rendering).toBe(true);
    s = reduceStream(s, { kind: "text", text: "All done" });
    expect(s.stepIndex).toBe(3);
    s = reduceStream(s, { kind: "result", ok: true, text: "Summary", cost: 0.2 });
    expect(s.stepIndex).toBe(STEPS.length - 1);
    expect(s.rendering).toBe(false);
    expect(s.finished).toBe(true);
    expect(s.summary).toBe("Summary");
  });
  it("never goes back and detects flatpak render", () => {
    let s = initialStreamState();
    s = reduceStream(s, { kind: "tool", name: "Bash", input: { command: "flatpak run --filesystem=home org.blender.Blender -b -P a.py -- move x" } });
    expect(s.stepIndex).toBe(3);
    s = reduceStream(s, { kind: "tool", name: "Read", input: { file_path: "/a" } });
    expect(s.stepIndex).toBe(3);
  });
  it("logs one line per event and flags errors", () => {
    let s = initialStreamState();
    s = reduceStream(s, { kind: "text", text: "Line one\nline two" });
    s = reduceStream(s, { kind: "tool", name: "Glob", input: { pattern: "*.py" } });
    expect(s.logs.length).toBe(3);
    s = reduceStream(s, { kind: "result", ok: false, text: "error_x", cost: null });
    expect(s.failed).toBe(true);
  });
});
