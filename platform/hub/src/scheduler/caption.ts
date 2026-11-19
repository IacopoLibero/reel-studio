import { readFile } from 'node:fs/promises';
import { afterOffer, isOfferLine, NO_OFFER, type OfferConfig } from '../brands/offer.js';

export function normalizeCaption(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').replace(/\s+$/, '');
}

export async function readCaption(path: string): Promise<string> {
  return normalizeCaption(await readFile(path, 'utf8'));
}

export function astralCount(text: string): number {
  let n = 0;
  for (const ch of text) if (ch.codePointAt(0)! > 0xffff) n++;
  return n;
}

/** Length Instagram shows: characters (code points) plus one extra per character above U+FFFF. */
export function expectedInstagramLength(text: string): number {
  return [...text].length + astralCount(text);
}

export function lastHashtag(text: string): string | null {
  const m = text.match(/#[\p{L}\p{N}_]+/gu);
  return m ? m[m.length - 1] : null;
}

export interface CaptionCheck {
  ok: boolean;
  problems: string[];
}

/** Compare the text read back from the editor (innerText) with the caption file. */
export function checkCaption(expected: string, actualInnerText: string): CaptionCheck {
  const problems: string[] = [];
  const actual = normalizeCaption(actualInnerText);
  if (/%23/.test(actual)) problems.push('caption contains %23');
  if (/%23/.test(expected)) problems.push('caption.md contains %23');
  const want = expectedInstagramLength(expected);
  if (actual.length !== want) problems.push(`length ${actual.length}, expected ${want}`);
  const tag = lastHashtag(expected);
  if (tag && lastHashtag(actual) !== tag) problems.push(`last hashtag is not ${tag}`);
  return { ok: problems.length === 0, problems };
}

/** True when the slot (YYYY-MM-DDTHH:mm, wall time) is after the offer's last day. Always false when the brand has no offer. */
export function slotIsAfterOffer(slot: string, offer: OfferConfig = NO_OFFER): boolean {
  return afterOffer(slot, offer);
}

export interface OfferResult {
  caption: string;
  /** The lines that were removed, for the job log. */
  dropped: string[];
}

/**
 * A caption for a slot after the offer ended must not advertise it: the gift line and any line matching the brand's offer pattern
 * are removed, together with the blank line they leave behind. Other lines (for example a trial line) stay.
 * caption.md is never changed: only the text typed into Instagram.
 */
export function dropExpiredOffer(caption: string, slot: string, offer: OfferConfig = NO_OFFER): OfferResult {
  if (!slotIsAfterOffer(slot, offer)) return { caption, dropped: [] };
  const lines = caption.split('\n');
  const dropped = lines.filter((l) => isOfferLine(l, offer));
  if (!dropped.length) return { caption, dropped: [] };
  const kept = lines.filter((l) => !isOfferLine(l, offer)).join('\n').replace(/\n{3,}/g, '\n\n');
  return { caption: normalizeCaption(kept), dropped };
}
