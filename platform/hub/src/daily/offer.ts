import { afterOffer, humanDay, isOfferLine, type OfferConfig } from "../brands/offer.js";

/** The offer handling follows the brand's offer rule (brand.json: offer.lastDay and offer.regex). No rule = feature off. */

/** True when the slot date (YYYY-MM-DD, local) is after the last day of the offer. */
export const slotAfterOffer = (slotDate: string, cfg: OfferConfig): boolean => afterOffer(slotDate, cfg);

/** The lines of a caption that carry the offer: the gift line or any line matching the brand's pattern. */
export const offerLines = (caption: string, cfg: OfferConfig): string[] => caption.split(/\r?\n/).filter((l) => isOfferLine(l, cfg));

export interface OfferCheck { applies: boolean; lines: string[]; message: string | null }

/** Only closing-A reels carry the offer line. */
export function checkOffer(closing: "A" | "B" | null, caption: string, slotDate: string, cfg: OfferConfig): OfferCheck {
  const lines = closing === "A" && slotAfterOffer(slotDate, cfg) ? offerLines(caption, cfg) : [];
  const last = cfg.lastDay;
  return {
    applies: lines.length > 0, lines,
    message: lines.length && last ? `The offer ended on ${humanDay(last)}. This caption still has it and the slot is on ${slotDate}.` : null,
  };
}

/** A copy of the caption without the offer lines and without the blank line they leave behind. caption.md is never touched. */
export function dropOfferLines(caption: string, cfg: OfferConfig): string {
  const kept = caption.split(/\r?\n/).filter((l) => !isOfferLine(l, cfg));
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "") + "\n";
}
