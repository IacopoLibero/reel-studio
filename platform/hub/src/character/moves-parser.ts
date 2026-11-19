import type { MoveInfo } from "../shared/types.js";

export interface CharacterPy { moves: Record<string, { fn: string; frames: number }>; loopFrom: Record<string, number> }
export interface MascotTs { frames: Record<string, number>; loopFrom: Record<string, number> }

const block = (src: string, start: RegExp): string => {
  const m = start.exec(src);
  if (!m) return "";
  const from = m.index + m[0].length;
  const end = src.indexOf("}", from);
  return end < 0 ? "" : src.slice(from, end);
};

const numPairs = (body: string, key: RegExp): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const m of body.matchAll(key)) out[m[1] as string] = Number(m[2]);
  return out;
};

/** Reads MOVES and LOOP_FROM out of the character's Blender script (mascot/<id>.py). */
export function parseCharacterPy(src: string): CharacterPy {
  const moves: CharacterPy["moves"] = {};
  for (const m of block(src, /^MOVES\s*=\s*\{/m).matchAll(/"([a-z0-9_]+)"\s*:\s*\(\s*([A-Za-z0-9_]+)\s*,\s*(\d+)\s*\)/g)) {
    moves[m[1] as string] = { fn: m[2] as string, frames: Number(m[3]) };
  }
  return { moves, loopFrom: numPairs(block(src, /^LOOP_FROM\s*=\s*\{/m), /"([a-z0-9_]+)"\s*:\s*(\d+)/g) };
}

/** Reads MOVE_FRAMES and LOOP_FROM out of src/mascot/Mascot.tsx. */
export function parseMascotTs(src: string): MascotTs {
  return {
    frames: numPairs(block(src, /export const MOVE_FRAMES\s*=\s*\{/), /\b([a-z0-9_]+)\s*:\s*(\d+)/g),
    loopFrom: numPairs(block(src, /export const LOOP_FROM[^=]*=\s*\{/), /\b([a-z0-9_]+)\s*:\s*(\d+)/g),
  };
}

export const validMoveName = (n: string): boolean => /^[a-z][a-z0-9_]{0,39}$/.test(n);

interface ClassifyIn {
  script: CharacterPy;
  mascot: MascotTs;
  rendered: Record<string, { frames: number; count: number }>;
}

/** One entry per move seen anywhere; faces are the moves that hold a pose (have a loop point). */
export function classify({ script, mascot, rendered }: ClassifyIn): MoveInfo[] {
  const names = new Set([...Object.keys(script.moves), ...Object.keys(mascot.frames), ...Object.keys(rendered)]);
  return [...names].map((name) => {
    const loopFrom = script.loopFrom[name] ?? mascot.loopFrom[name] ?? null;
    const r = rendered[name];
    return {
      name,
      frames: script.moves[name]?.frames ?? mascot.frames[name] ?? r?.frames ?? 0,
      loopFrom,
      rendered: !!r && r.count > 0,
      renderedFrames: r?.frames ?? 0,
      inScript: name in script.moves,
      inMascot: name in mascot.frames,
      kind: loopFrom !== null ? "face" : "move",
    } satisfies MoveInfo;
  });
}
