import { matchReel, type ReelRef } from "../calendar/merge.js";

const EMOJI = /[\p{Extended_Pictographic}️‍⃣]+/gu;

const firstLine = (caption: string): string => caption.split("\n").find((l) => l.trim())?.trim() ?? "";

/** The opening line of a caption without emoji, as the hook shown next to the numbers. */
export function cleanHook(caption: string): string {
  return firstLine(caption).replace(EMOJI, "").replace(/\s+/g, " ").trim();
}

/** Short caption start kept in the snapshot. */
export const captionStart = (caption: string): string => {
  const l = firstLine(caption);
  return l.length > 120 ? `${l.slice(0, 120)}…` : l;
};

/** The reel folder whose caption starts like the media's caption (same rule as the calendar). */
export function matchMedia(caption: string, reels: readonly ReelRef[]): ReelRef | null {
  return matchReel(firstLine(caption), reels);
}
