import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { planSchema, seriesInput } from "../src/series/schema.js";
import { SeriesStore } from "../src/series/store.js";

let dir: string, store: SeriesStore;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "series-")); store = new SeriesStore(join(dir, "series.json")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const input = (o: object = {}) => seriesInput.parse({ name: "Myth busters", promise: "One myth, one fact", cadence: "weekly", exampleHooks: ["Is a paper menu really cheaper?"], ...o });
const A = "aaaaaaaaaaaa", B = "bbbbbbbbbbbb", C = "cccccccccccc";

describe("SeriesStore", () => {
  it("starts empty and survives a missing or broken file", () => {
    expect(store.list()).toEqual([]);
    writeFileSync(join(dir, "series.json"), "{nope");
    expect(store.list()).toEqual([]);
  });
  it("creates, persists and reads a series", () => {
    const s = store.create(input({ questionIds: [A, A, B] }), new Date("2026-11-19T10:00:00Z"));
    expect(s.questionIds).toEqual([A, B]);
    expect(s.createdAt).toBe("2026-11-19T10:00:00.000Z");
    expect(new SeriesStore(join(dir, "series.json")).get(s.id)?.name).toBe("Myth busters");
  });
  it("moves a question from one series to the other instead of duplicating it", () => {
    const one = store.create(input({ questionIds: [A, B] }));
    const two = store.create(input({ name: "Quick wins", questionIds: [B, C] }));
    expect(store.get(one.id)?.questionIds).toEqual([A]);
    expect(store.get(two.id)?.questionIds).toEqual([B, C]);
    store.assign(one.id, [C]);
    expect(store.get(two.id)?.questionIds).toEqual([B]);
    expect(store.badges()).toEqual({ [C]: { id: one.id, name: "Myth busters" }, [B]: { id: two.id, name: "Quick wins" } });
  });
  it("updates without mutating the old object and returns null for unknown ids", () => {
    const s = store.create(input());
    const u = store.update(s.id, input({ name: "Renamed" }));
    expect(u?.name).toBe("Renamed");
    expect(s.name).toBe("Myth busters");
    expect(u?.id).toBe(s.id);
    expect(store.update("000000000000", input())).toBeNull();
    expect(store.assign("000000000000", [A])).toBeNull();
  });
  it("removes a series", () => {
    const s = store.create(input());
    expect(store.remove(s.id)).toBe(true);
    expect(store.remove(s.id)).toBe(false);
    expect(store.list()).toEqual([]);
  });
});

describe("series schemas", () => {
  it("rejects bad input", () => {
    expect(seriesInput.safeParse({ name: "x" }).success).toBe(false);
    expect(seriesInput.safeParse({ name: "Fine name", questionIds: ["nope"] }).success).toBe(false);
    expect(seriesInput.safeParse({ name: "Fine name", promise: "a\nb" }).success).toBe(false);
    expect(seriesInput.safeParse({ name: "Fine name" }).success).toBe(true);
  });
  it("validates the plan Claude returns", () => {
    expect(planSchema.safeParse({ name: "Myth busters", promise: "p", cadence: "weekly", exampleHooks: ["h"] }).success).toBe(true);
    expect(planSchema.safeParse({ name: "Myth busters", promise: "p", cadence: "weekly", exampleHooks: [] }).success).toBe(false);
  });
});
