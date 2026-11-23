import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface MoveFrames { frames: Record<string, number>; loopFrom: Record<string, number> }

const body = (o: Record<string, number>): string => Object.entries(o).map(([k, v]) => `  ${k}: ${v},`).join("\n");

/**
 * The text of a brand's Mascot component (brand/<slug>/code/mascot/Mascot.tsx): plays a rendered move frame by frame
 * from public/mascot/<move>/f-NNNN.png (mouth closed) and o-NNNN.png (mouth open). The same component a hand-made character uses.
 */
export function mascotComponent(m: MoveFrames, name: string): string {
  const loops = Object.entries(m.loopFrom).map(([k, v]) => `${k}: ${v}`).join(", ");
  const looping = ["idle", "talk"].filter((k) => k in m.frames).map((k) => `"${k}"`).join(", ");
  return `import React from "react";
import { Img, staticFile } from "remotion";

/** Frame counts of the rendered moves (public/mascot/<move>/f-0001.png and o-0001.png). Keep in step with MOVES in mascot/<id>.py. */
export const MOVE_FRAMES = {
${body(m.frames)}
} as const;

/** Moves that hold a pose: they play once up to this frame, then loop from it to the end. */
export const LOOP_FROM: Partial<Record<Move, number>> = {
  ${loops}
};

export type Move = keyof typeof MOVE_FRAMES;

interface MascotProps {
  /** Move to play. */
  move: Move;
  /** Current frame inside the scene. */
  frame: number;
  /** Scene frame at which the move starts. */
  start?: number;
  /** Loop the move (idle and talk loop; the others play once and hold their last frame). */
  loop?: boolean;
  /** Left edge and bottom of the picture, in px of the 1080 x 1920 canvas. */
  x: number;
  y: number;
  /** Height of the picture in px (the rendered square is size x size). */
  size?: number;
  /** Mirror left to right. */
  flip?: boolean;
  /** Mouth open (the "o" render of the same frame). Choose it from the voice with \`mouthOpen\`. */
  open?: boolean;
}

const LOOPING: ReadonlySet<Move> = new Set<Move>([${looping}]);

/**
 * Calm lip sync from the word start frames of a scene: the mouth opens for a few frames on every other word,
 * so the character looks like it is talking without flapping.
 */
export const mouthOpen = (frame: number, wf: number[], hold = 6): boolean =>
  wf.some((s, i) => i % 2 === 0 && frame >= s && frame < s + hold);

/** ${name || "The brand character"}: plays a rendered move frame by frame so every change is computed from the current frame. */
export const Mascot: React.FC<MascotProps> = ({ move, frame, start = 0, loop, x, y, size = 760, flip = false, open = false }) => {
  const total = MOVE_FRAMES[move];
  const t = Math.max(0, Math.floor(frame - start));
  const looping = loop ?? LOOPING.has(move);
  const from = LOOP_FROM[move];
  const idx = from !== undefined ? (t < from ? t : from + ((t - from) % (total - from))) : looping ? t % total : Math.min(total - 1, t);
  const n = String(idx + 1).padStart(4, "0");
  if (frame < start) return null;
  return (
    <Img
      src={staticFile(\`mascot/\${move}/\${open ? "o" : "f"}-\${n}.png\`)}
      style={{ position: "absolute", left: x, top: y - size, width: size, height: size, transform: flip ? "scaleX(-1)" : undefined }}
    />
  );
};
`;
}

/** Writes the brand's Mascot component. Never overwrites one that exists. Returns true when it was written. */
export function writeMascotComponent(brandDir: string, m: MoveFrames, name: string): boolean {
  const file = join(brandDir, "code", "mascot", "Mascot.tsx");
  if (existsSync(file)) return false;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, mascotComponent(m, name));
  return true;
}
