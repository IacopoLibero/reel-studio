import { describe, expect, it } from "vitest";
import { parseRoute, routeHash } from "../web/hooks.js";

const pages = ["jobs", "reels", "settings"] as const;

describe("parseRoute", () => {
  it("reads brand and page, with no item", () => {
    expect(parseRoute("#/acme/reels", pages)).toEqual({ brand: "acme", page: "reels", item: null });
  });
  it("reads the item of a page: a reel folder", () => {
    expect(parseRoute("#/acme/reels/3-half-loaf", pages)).toEqual({ brand: "acme", page: "reels", item: "3-half-loaf" });
  });
  it("keeps the old forms: a bare page, the creator, an empty hash", () => {
    expect(parseRoute("#/reels", pages)).toEqual({ brand: null, page: "reels", item: null });
    expect(parseRoute("#/new", pages)).toEqual({ brand: "new", page: null, item: null });
    expect(parseRoute("", pages)).toEqual({ brand: null, page: null, item: null });
  });
  it("decodes an item and ignores a trailing slash", () => {
    expect(parseRoute("#/acme/reels/3-half%20loaf/", pages).item).toBe("3-half loaf");
  });
});

describe("routeHash", () => {
  it("builds the address of a page, and of an item of a page", () => {
    expect(routeHash("acme", "reels")).toBe("#/acme/reels");
    expect(routeHash("acme", "reels", "3-half-loaf")).toBe("#/acme/reels/3-half-loaf");
  });
});
