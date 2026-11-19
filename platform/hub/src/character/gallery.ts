import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { MoveInfo } from "../shared/types.js";
import { classify, parseCharacterPy, parseMascotTs } from "./moves-parser.js";

const read = (f: string) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };

/** The Blender script of a character: mascot/<id>.py (private, never in the public repository). */
export const characterScript = (root: string, id: string) => join(root, "mascot", `${id}.py`);
export const mascotTs = (root: string) => join(root, "src/mascot/Mascot.tsx");
export const moveDir = (root: string, move: string) => join(root, "public/mascot", move);

/** Number of rendered PNGs of a move, optionally only those written at or after `sinceMs`. */
export function countPngs(dir: string, sinceMs = 0): number {
  try {
    return readdirSync(dir).filter((f) => /^[fo]-\d+\.png$/.test(f) && (sinceMs === 0 || statSync(join(dir, f)).mtimeMs >= sinceMs)).length;
  } catch { return 0; }
}

export function readMoveFrames(root: string, id: string, move: string): number | null {
  return parseCharacterPy(read(characterScript(root, id))).moves[move]?.frames ?? null;
}

export function listMoves(root: string, id: string): MoveInfo[] {
  const base = join(root, "public/mascot");
  const rendered: Record<string, { frames: number; count: number }> = {};
  if (existsSync(base)) {
    for (const e of readdirSync(base, { withFileTypes: true })) {
      if (!e.isDirectory() || !existsSync(join(base, e.name, "info.json"))) continue;
      let frames = 0;
      try { frames = Number(JSON.parse(read(join(base, e.name, "info.json"))).frames) || 0; } catch { /* keep 0 */ }
      rendered[e.name] = { frames, count: countPngs(join(base, e.name)) };
    }
  }
  return classify({ script: parseCharacterPy(read(characterScript(root, id))), mascot: parseMascotTs(read(mascotTs(root))), rendered })
    .sort((a, b) => a.name.localeCompare(b.name));
}
