import { describe, expect, it } from "vitest";
import { parseRange } from "../src/routes/range.js";

describe("parseRange", () => {
  it("is null without a header or with one it does not understand", () => {
    expect(parseRange(undefined, 10)).toBeNull();
    expect(parseRange("items=0-5", 10)).toBeNull();
    expect(parseRange("bytes=-", 10)).toBeNull();
  });
  it("reads start-end, open end and suffix", () => {
    expect(parseRange("bytes=2-5", 10)).toEqual({ start: 2, end: 5 });
    expect(parseRange("bytes=7-", 10)).toEqual({ start: 7, end: 9 });
    expect(parseRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
    expect(parseRange("bytes=0-0", 10)).toEqual({ start: 0, end: 0 });
  });
  it("cuts an end past the file, and a suffix longer than the file gives all of it", () => {
    expect(parseRange("bytes=5-99", 10)).toEqual({ start: 5, end: 9 });
    expect(parseRange("bytes=-99", 10)).toEqual({ start: 0, end: 9 });
  });
  it("is unsatisfiable outside the file or backwards", () => {
    expect(parseRange("bytes=10-12", 10)).toBe("unsatisfiable");
    expect(parseRange("bytes=5-2", 10)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", 10)).toBe("unsatisfiable");
    expect(parseRange("bytes=0-5", 0)).toBe("unsatisfiable");
  });
});
