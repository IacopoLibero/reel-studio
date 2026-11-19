import { describe, it, expect } from "vitest";
import { parseCharacterPy, parseMascotTs, classify, validMoveName } from "../src/character/moves-parser.js";

const py = `
LOOP_FROM = {"surprised": 8, "thinking": 8,
             "crying": 8}

MOVES = {  # name: (function, frames)
    "idle": (m_idle, 48),
    "thumbs_up": (m_thumbs, 44),
    "surprised": (m_surprised, 48),
}
`;
const ts = `
export const MOVE_FRAMES = {
  idle: 48,
  thumbs_up: 44,
  surprised: 48,
} as const;
export const LOOP_FROM: Partial<Record<Move, number>> = {
  surprised: 8, thinking: 8,
};
`;

describe("parseCharacterPy", () => {
  it("reads moves, function names and frames", () => {
    const p = parseCharacterPy(py);
    expect(p.moves).toEqual({ idle: { fn: "m_idle", frames: 48 }, thumbs_up: { fn: "m_thumbs", frames: 44 }, surprised: { fn: "m_surprised", frames: 48 } });
    expect(p.loopFrom).toEqual({ surprised: 8, thinking: 8, crying: 8 });
  });
  it("returns empty on unrelated text", () => {
    expect(parseCharacterPy("print(1)")).toEqual({ moves: {}, loopFrom: {} });
  });
});

describe("parseMascotTs", () => {
  it("reads frames and loop points", () => {
    const p = parseMascotTs(ts);
    expect(p.frames).toEqual({ idle: 48, thumbs_up: 44, surprised: 48 });
    expect(p.loopFrom).toEqual({ surprised: 8, thinking: 8 });
  });
  it("returns empty on unrelated text", () => {
    expect(parseMascotTs("x")).toEqual({ frames: {}, loopFrom: {} });
  });
});

describe("classify", () => {
  it("merges sources and splits moves from faces", () => {
    const list = classify({
      script: parseCharacterPy(py), mascot: parseMascotTs(ts),
      rendered: { idle: { frames: 48, count: 96 }, extra: { frames: 10, count: 20 } },
    });
    const by = Object.fromEntries(list.map((m) => [m.name, m]));
    expect(by.idle).toMatchObject({ kind: "move", rendered: true, renderedFrames: 48, inScript: true, inMascot: true, loopFrom: null });
    expect(by.surprised).toMatchObject({ kind: "face", loopFrom: 8, rendered: false });
    expect(by.extra).toMatchObject({ inScript: false, inMascot: false, rendered: true, frames: 10 });
  });
});

describe("validMoveName", () => {
  it("accepts snake case only", () => {
    expect(validMoveName("high_five")).toBe(true);
    for (const bad of ["", "High", "a b", "../x", "1abc", "a".repeat(41)]) expect(validMoveName(bad)).toBe(false);
  });
});
