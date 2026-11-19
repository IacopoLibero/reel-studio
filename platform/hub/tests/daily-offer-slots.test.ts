import { describe, expect, it } from "vitest";
import { offerOf } from "../src/brands/offer.js";
import { testBrand } from "./helpers/brand.js";
import { checkOffer, dropOfferLines, offerLines, slotAfterOffer } from "../src/daily/offer.js";
import { parseBestTime, suggestSlots, takenKeys } from "../src/daily/slots.js";
import { DEFAULT_PATTERN } from "../src/slots.js";

const OFFER = offerOf(testBrand("acme", { offer: { lastDay: "2026-11-30", regex: "ACMEFREE" } }));

const CAP = `Do guests hate QR menus? 👇

📌 Mostly the bad ones

🎁 Launch offer for new customers: use code ACMEFREE-BASE, ACMEFREE-PREMIUM or ACMEFREE-ENTERPRISE at checkout. Valid until 30 November.

Follow for more restaurant tips.

#qrmenu #acme
`;

describe("offer date rule", () => {
  it("the offer lasts through 30 November, not after", () => {
    expect(slotAfterOffer("2026-11-30", OFFER)).toBe(false);
    expect(slotAfterOffer("2026-12-01", OFFER)).toBe(true);
    expect(slotAfterOffer("2027-01-02", OFFER)).toBe(true);
  });
  it("warns only for closing A with an offer line and a late slot", () => {
    expect(checkOffer("A", CAP, "2026-12-02", OFFER)).toMatchObject({ applies: true });
    expect(checkOffer("A", CAP, "2026-11-30", OFFER).applies).toBe(false);
    expect(checkOffer("B", CAP, "2026-12-02", OFFER).applies).toBe(false);
    expect(checkOffer("A", "Plain caption\n#x", "2026-12-02", OFFER).applies).toBe(false);
    expect(checkOffer("A", CAP, "2026-12-02", OFFER).message).toMatch(/ended on 30 November/);
  });
  it("finds the gift line and ACMEFREE lines", () => {
    expect(offerLines(CAP, OFFER)).toHaveLength(1);
    expect(offerLines("code acmefree-base here", OFFER)).toHaveLength(1);
  });
  it("drops the offer line without leaving a gap, and does not touch the input", () => {
    const out = dropOfferLines(CAP, OFFER);
    expect(out).not.toMatch(/🎁|ACMEFREE/);
    expect(out).not.toMatch(/\n{3,}/);
    expect(out).toContain("📌 Mostly the bad ones");
    expect(out).toContain("Follow for more restaurant tips.");
    expect(out.endsWith("#qrmenu #acme\n")).toBe(true);
    expect(CAP).toContain("ACMEFREE");
  });
});

describe("offer rule per brand", () => {
  it("a brand without an offer never has offer lines", () => {
    const none = offerOf(testBrand("plain"));
    expect(offerLines(CAP, none)).toEqual([]);
    expect(slotAfterOffer("2099-01-01", none)).toBe(false);
    expect(checkOffer("A", CAP, "2099-01-01", none).applies).toBe(false);
  });
  it("two brands keep separate rules", () => {
    const other = offerOf(testBrand("other", { offer: { lastDay: "2027-01-31", regex: "OTHERCODE" } }));
    expect(slotAfterOffer("2026-12-15", OFFER)).toBe(true);
    expect(slotAfterOffer("2026-12-15", other)).toBe(false);
    expect(offerLines("use OTHERCODE now", OFFER)).toEqual([]);
    expect(offerLines("use OTHERCODE now", other)).toHaveLength(1);
  });
});

describe("best time and slots", () => {
  it("parses weekday and time", () => {
    expect(parseBestTime("Tue 17:30")).toEqual({ dow: 2, time: "17:30" });
    expect(parseBestTime("best at 8:00")).toEqual({ dow: null, time: "08:00" });
    expect(parseBestTime("no time here")).toBeNull();
  });
  // Friday 2026-11-20, 10:00 Rome
  const now = new Date("2026-11-20T09:00:00Z");
  it("recommends the next free slot when there is no best time", () => {
    const s = suggestSlots(DEFAULT_PATTERN, now, new Set(), []);
    expect(s.recommended?.label).toBe("Fri 20 Nov 17:30");
    expect(s.bestTimeNote).toBeNull();
  });
  it("skips taken slots", () => {
    const s = suggestSlots(DEFAULT_PATTERN, now, takenKeys(["2026-11-20 17:30"]), []);
    expect(s.recommended?.label).toBe("Sat 21 Nov 07:30");
    expect(s.slots.find((x) => x.date === "2026-11-20" && x.time === "17:30")?.taken).toBe(true);
  });
  it("prefers the first free slot that matches a best time", () => {
    const s = suggestSlots(DEFAULT_PATTERN, now, new Set(), ["Sat 17:30"]);
    expect(s.recommended?.label).toBe("Sat 21 Nov 17:30");
    expect(s.bestTimeNote).toMatch(/best time/);
  });
  it("says so when no free slot matches", () => {
    const s = suggestSlots(DEFAULT_PATTERN, now, new Set(), ["Mon 03:15"], 4);
    expect(s.recommended?.label).toBe("Fri 20 Nov 17:30");
    expect(s.bestTimeNote).toMatch(/No free slot/);
  });
});
