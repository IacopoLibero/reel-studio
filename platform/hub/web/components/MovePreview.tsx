import { useEffect, useState } from "react";
import type { MoveInfo } from "../../src/shared/types";
import { scoped } from "../api";

/** Plays a move's PNG sequence like Mascot.tsx does: up to the loop point once, then looping from it. */
export const frameIndex = (t: number, total: number, loopFrom: number | null, loops: boolean): number =>
  loopFrom !== null && loopFrom < total ? (t < loopFrom ? t : loopFrom + ((t - loopFrom) % (total - loopFrom))) : loops ? t % total : t % total;

export const frameUrl = (move: string, idx: number, open: boolean) =>
  scoped(`/character/${move}/frame/${open ? "o" : "f"}-${String(idx + 1).padStart(4, "0")}.png`);

export function MovePreview({ move, open, size = 220 }: { move: MoveInfo; open: boolean; size?: number }) {
  const [t, setT] = useState(0);
  const total = move.renderedFrames || move.frames;
  useEffect(() => {
    if (!total) return;
    const id = setInterval(() => setT((x) => x + 1), 1000 / 30);
    return () => clearInterval(id);
  }, [total, move.name]);
  if (!move.rendered || !total) return <div style={{ width: size, height: size }} className="muted">Not rendered</div>;
  return <img src={frameUrl(move.name, frameIndex(t, total, move.loopFrom, true), open)} width={size} height={size} alt={move.name} style={{ objectFit: "contain" }} />;
}
