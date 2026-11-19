import type { Brand } from "./schema.js";

export interface OfferConfig {
  /** Last day (YYYY-MM-DD) the offer may be advertised, or null when the feature is off. */
  lastDay: string | null;
  /** Lines matching this text belong to the offer. Null when the feature is off. */
  pattern: RegExp | null;
}

export const NO_OFFER: OfferConfig = { lastDay: null, pattern: null };

/** The offer rule of a brand (brand.json: offer.lastDay and offer.regex, matched case-insensitively). A brand without both has no offer handling. */
export function offerOf(brand: Pick<Brand, "offer"> | null | undefined): OfferConfig {
  if (!brand) return NO_OFFER;
  let pattern: RegExp | null = null;
  if (brand.offer.regex) {
    try { pattern = new RegExp(brand.offer.regex, "i"); } catch { pattern = null; }
  }
  return { lastDay: brand.offer.lastDay, pattern };
}

/** Human form of a YYYY-MM-DD date, for messages: "30 November 2026". */
export function humanDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** True when the line carries the offer: the gift marker or the brand's pattern. Always false when the feature is off. */
export function isOfferLine(line: string, cfg: OfferConfig): boolean {
  if (!cfg.lastDay && !cfg.pattern) return false;
  return line.includes("\u{1F381}") || (cfg.pattern?.test(line) ?? false);
}

/** True when the slot date (first 10 characters, YYYY-MM-DD) is after the last day of the offer. False when no date is set. */
export function afterOffer(slot: string, cfg: OfferConfig): boolean {
  return cfg.lastDay !== null && slot.slice(0, 10) > cfg.lastDay;
}
