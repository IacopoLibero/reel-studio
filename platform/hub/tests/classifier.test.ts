import { describe, it, expect } from "vitest";
import { classifyClosing, DEFAULT_RULES, type ClosingRules } from "../src/factory/classifier.js";

// Keyword lists of one restaurant brand: the factory ships none, each brand sets its own.
const RESTAURANT_RULES: ClosingRules = {
  product: [
    "qr", "digital menu", "paper menu", "printed menu", "reprint*", "print*", "menu price*", "price*", "translate", "translation",
    "kitchen screen*", "kitchen display*", "display system", "order mistakes", "order errors", "wrong order*",
    "set up", "setup", "app", "paper", "going digital", "go digital", "2010",
  ],
  general: [
    "allerg*", "rules", "law", "laws", "regulation*", "review*", "google", "marketing", "staff*", "rota",
    "lunch rush", "tourist*", "languages", "number of",
  ],
};

// The 15 reels whose closing was chosen by hand (reel-questions.md).
const FIXTURES: [number, "A" | "B", string, string][] = [
  [7, "B", "What happens when a guest with an allergy asks and your staff doesn't know the answer?", "allergen-management-eu-restaurants"],
  [8, "B", "Is your menu breaking EU allergen rules without you knowing it?", "allergen-management-eu-restaurants"],
  [10, "B", "What do guests look at on Google before they choose your restaurant?", "get-more-google-reviews-restaurant"],
  [13, "B", "How do you take orders faster during the lunch rush?", "lunch-service-efficiency-restaurant"],
  [14, "B", "How do you serve more tables with the same staff?", "improve-restaurant-efficiency"],
  [20, "B", "What do restaurants in tourist cities do about guests who don't read the menu?", "multilingual-restaurant-menu-benefits"],
  [21, "B", "Which 6 languages cover most of the tourists in Europe?", "multilingual-restaurant-menu-benefits"],
  [9, "A", "What happens when the price on your printed menu is wrong?", "digital-menu-restaurants-complete-guide"],
  [11, "A", "Do guests really hate QR menus?", ""],
  [12, "A", "Is a paper menu really cheaper?", "digital-menu-restaurants-complete-guide"],
  [15, "A", "How long does it really take to set up a QR menu?", "how-to-set-up-qr-menu-restaurant"],
  [16, "A", "How do you change a price on your menu in seconds?", "how-to-set-up-qr-menu-restaurant"],
  [17, "A", "What is the easiest way to translate your menu?", "multilingual-restaurant-menu-benefits"],
  [18, "A", "Are you still running your restaurant like it's 2010?", ""],
  [19, "A", "What would you do with the hours you spend fixing order mistakes?", "reduce-order-errors-restaurant"],
];

describe("classifyClosing", () => {
  for (const [n, want, q, src] of FIXTURES) {
    it(`reel ${n} is ${want}`, () => expect(classifyClosing(q, src, RESTAURANT_RULES)).toBe(want));
  }
  it("defaults to B with no match", () => {
    expect(classifyClosing("Why does the sky look blue?", "", RESTAURANT_RULES)).toBe("B");
  });
  it("uses the source only when the question has no match", () => {
    expect(classifyClosing("Is it worth it?", "qr-code-ordering-how-it-works", RESTAURANT_RULES)).toBe("A");
    expect(classifyClosing("What about your review?", "qr-code-ordering", RESTAURANT_RULES)).toBe("B");
    expect(classifyClosing("Is it worth it?", "qr-staff-review", RESTAURANT_RULES)).toBe("B");
  });
  it("product keywords in the question win over general ones", () => {
    expect(classifyClosing("Do reviews appear on your QR menu?", "", RESTAURANT_RULES)).toBe("A");
  });
  it("matches whole words, not fragments", () => {
    expect(classifyClosing("What happens next?", "", RESTAURANT_RULES)).toBe("B");
  });
  it("honours custom rules", () => {
    expect(classifyClosing("Hello pizza", "", { product: ["pizza"], general: [] })).toBe("A");
  });
  it("ships no keywords, so every reel gets closing B until the brand sets some", () => {
    expect(DEFAULT_RULES).toEqual({ product: [], general: [] });
    expect(classifyClosing("Is a paper menu really cheaper?", "digital-menu-guide", DEFAULT_RULES)).toBe("B");
  });
});
