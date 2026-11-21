import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { MoveInfo } from "../shared/types.js";
import { classify, parseCharacterPy, parseMascotTs } from "./moves-parser.js";

const read = (f: string) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };

/** The Blender script of a character: brand/<slug>/mascot/<id>.py, given the brand's mascot folder. */
export const characterScript = (mascotDir: string, id: string): string => join(mascotDir, `${id}.py`);
export const mascotTs = (root: string): string => join(root, "src/mascot/Mascot.tsx");
/** Where the rendered PNG sequence of one move is: brand/<slug>/mascot/movements/<move>/. */
export const moveDir = (mascotDir: string, move: string): string => join(mascotDir, "movements", move);

/** Number of rendered PNGs of a move, optionally only those written at or after `sinceMs`. */
export function countPngs(dir: string, sinceMs = 0): number {
  try {
    return readdirSync(dir).filter((f) => /^[fo]-\d+\.png$/.test(f) && (sinceMs === 0 || statSync(join(dir, f)).mtimeMs >= sinceMs)).length;
  } catch { return 0; }
}

export function readMoveFrames(mascotDir: string, id: string, move: string): number | null {
  return parseCharacterPy(read(characterScript(mascotDir, id))).moves[move]?.frames ?? null;
}

export function listMoves(root: string, mascotDir: string, id: string): MoveInfo[] {
  const base = join(mascotDir, "movements");
  const rendered: Record<string, { frames: number; count: number }> = {};
  if (existsSync(base)) {
    for (const e of readdirSync(base, { withFileTypes: true })) {
      if (!e.isDirectory() || !existsSync(join(base, e.name, "info.json"))) continue;
      let frames = 0;
      try { frames = Number(JSON.parse(read(join(base, e.name, "info.json"))).frames) || 0; } catch { /* keep 0 */ }
      rendered[e.name] = { frames, count: countPngs(join(base, e.name)) };
    }
  }
  return classify({ script: parseCharacterPy(read(characterScript(mascotDir, id))), mascot: parseMascotTs(read(mascotTs(root))), rendered })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface FoundCharacter { brand: string; id: string; dir: string }

/** Every character on this machine: a brand's mascot/<id>.py, in the order of the brand folders. `brandsDir` is <data>/brands. */
export function listCharacters(brandsDir: string): FoundCharacter[] {
  const out: FoundCharacter[] = [];
  try {
    for (const b of readdirSync(brandsDir, { withFileTypes: true })) {
      if (!b.isDirectory() || b.name.startsWith(".")) continue;
      const dir = join(brandsDir, b.name, "mascot");
      let files: string[] = [];
      try { files = readdirSync(dir); } catch { continue; }
      for (const f of files.sort()) if (/^[a-z][a-z0-9_-]{0,39}\.py$/.test(f)) out.push({ brand: b.name, id: f.slice(0, -3), dir });
    }
  } catch { /* no brand folder */ }
  return out;
}

/** The first brand that has the character `id`, or null. */
export const findCharacter = (brandsDir: string, id: string): FoundCharacter | null => listCharacters(brandsDir).find((c) => c.id === id) ?? null;
