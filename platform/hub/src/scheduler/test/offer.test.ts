import { describe, expect, it } from 'vitest';
import { dropExpiredOffer as drop, slotIsAfterOffer as after } from '../caption.js';
import { NO_OFFER, type OfferConfig } from '../../brands/offer.js';

const OFFER: OfferConfig = { lastDay: '2026-11-30', pattern: /ACMEFREE/i };
const dropExpiredOffer = (c: string, slot: string, offer: OfferConfig = OFFER) => drop(c, slot, offer);
const slotIsAfterOffer = (slot: string, offer: OfferConfig = OFFER) => after(slot, offer);

const cap = [
  'What happens when the price on your printed menu is wrong? 👇',
  '',
  '📌 A price changes',
  '',
  '🎁 Launch offer for new customers: use code ACMEFREE-BASE, ACMEFREE-PREMIUM or ACMEFREE-ENTERPRISE (matching your plan) at checkout and your first month is on us. Valid until 30 November.',
  'Try it free for 14 days → acme.example (link in bio)',
  '',
  'Save this 📌',
  '',
  '#digitalmenu #acme',
].join('\n');

describe('expired launch offer', () => {
  it('the offer lasts through 30 November 2026 and the slot date decides', () => {
    expect(slotIsAfterOffer('2026-11-30T19:00')).toBe(false);
    expect(slotIsAfterOffer('2026-12-01T07:30')).toBe(true);
    expect(slotIsAfterOffer('2026-11-26T08:00')).toBe(false);
  });

  it('keeps the caption untouched up to and including 30 November', () => {
    expect(dropExpiredOffer(cap, '2026-11-30T19:00')).toEqual({ caption: cap, dropped: [] });
  });

  it('after 30 November drops the gift line and the ACMEFREE codes, and keeps the trial line and everything else', () => {
    const out = dropExpiredOffer(cap, '2026-12-01T07:30');
    expect(out.dropped).toHaveLength(1);
    expect(out.dropped[0]).toContain('ACMEFREE-BASE');
    expect(out.caption).not.toMatch(/ACMEFREE|🎁/);
    expect(out.caption).toContain('Try it free for 14 days → acme.example (link in bio)');
    expect(out.caption).toContain('#digitalmenu #acme');
    expect(out.caption).not.toMatch(/\n\n\n/);
  });

  it('leaves captions without an offer (closing B) alone at any date', () => {
    const b = 'Is a menu enough? 👇\n\n📌 Tip\n\nFollow for more restaurant tips.\n\n#acme';
    expect(dropExpiredOffer(b, '2027-02-01T08:00')).toEqual({ caption: b, dropped: [] });
  });
});

describe('offer handling is off without a rule', () => {
  it('keeps every caption untouched when the brand has no offer', () => {
    expect(slotIsAfterOffer('2099-01-01T10:00', NO_OFFER)).toBe(false);
    expect(dropExpiredOffer(cap, '2099-01-01T10:00', NO_OFFER)).toEqual({ caption: cap, dropped: [] });
  });
});
