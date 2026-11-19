import { describe, it, expect } from "vitest";
import { MAKE_STEPS, initialMakeState, reduceMake, missingOutputs } from "../src/factory/make-stream.js";

const tool = (name: string, input: Record<string, unknown>) => ({ kind: "tool" as const, name, input });

describe("reduceMake", () => {
  it("starts at Script and only moves forward", () => {
    let s = initialMakeState();
    expect(s.step).toBe("Script");
    s = reduceMake(s, tool("Write", { file_path: "/r/reels/a/1-x/script.json" }));
    expect(s.step).toBe("Voice");
    s = reduceMake(s, tool("Bash", { command: "bash scripts/slot.sh voice 1 -- node scripts/voice.mjs reels/a/1-x" }));
    expect(s.step).toBe("Voice");
    s = reduceMake(s, tool("Write", { file_path: "/r/reels/a/1-x/plan.md" }));
    expect(s.step).toBe("Plan");
    s = reduceMake(s, tool("Edit", { file_path: "/r/src/f3/Scenes.tsx" }));
    expect(s.step).toBe("Build");
    s = reduceMake(s, tool("Bash", { command: "bash scripts/slot.sh render 3 -- npx remotion render Buddy out.mp4" }));
    expect(s.step).toBe("Render");
    s = reduceMake(s, tool("Bash", { command: "ffmpeg -i out.mp4 frames/%d.png" }));
    expect(s.step).toBe("Checks");
    s = reduceMake(s, tool("Write", { file_path: "/r/reels/a/1-x/caption.md" }));
    expect(s.step).toBe("Caption");
    s = reduceMake(s, tool("Bash", { command: "npx remotion still Cover reels/a/1-x/cover.png" }));
    expect(s.step).toBe("Cover");
    s = reduceMake(s, tool("Read", { file_path: "/x" }));
    expect(s.step).toBe("Cover");
    s = reduceMake(s, { kind: "result", ok: true, text: "done", cost: null });
    expect(s.step).toBe("Done");
    expect(s.finished).toBe(true);
  });
  it("advances from files that appear", () => {
    let s = initialMakeState();
    s = reduceMake(s, { kind: "files", present: ["script.json", "buddy-props.json"] });
    expect(s.step).toBe("Plan");
    s = reduceMake(s, { kind: "files", present: ["script.json", "buddy-props.json", "x.mp4", "caption.md"] });
    expect(s.step).toBe("Cover");
    s = reduceMake(s, { kind: "files", present: ["script.json"] });
    expect(s.step).toBe("Cover");
  });
  it("keeps the last error and logs", () => {
    let s = initialMakeState();
    s = reduceMake(s, { kind: "text", text: "Voice server did not start\nretrying" });
    expect(s.logs).toHaveLength(2);
    s = reduceMake(s, { kind: "result", ok: false, text: "error_max_turns", cost: null });
    expect(s.failed).toBe(true);
    expect(s.lastError).toBe("error_max_turns");
  });
  it("has 9 steps with progress marks", () => {
    expect(MAKE_STEPS).toEqual(["Script", "Voice", "Plan", "Build", "Render", "Checks", "Caption", "Cover", "Done"]);
  });
});

describe("missingOutputs", () => {
  it("lists what is absent", () => {
    expect(missingOutputs(["a.mp4", "caption.md", "cover.png"])).toEqual([]);
    expect(missingOutputs(["caption.md"])).toEqual(["mp4", "cover.png"]);
  });
});
