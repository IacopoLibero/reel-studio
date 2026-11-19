import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_BRAND_SETTINGS, DEFAULT_GLOBAL_SETTINGS, DEFAULT_SETTINGS, SettingsStore, mergeSettings, settingsSchema, splitSettings } from "../src/settings.js";

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "settings-")); });
afterEach(() => rmSync(tmp, { recursive: true, force: true }));
const store = (accounts: Record<string, string> = {}, def: string | null = "acme") =>
  new SettingsStore(join(tmp, "settings.json"), { brandFile: (s) => join(tmp, "brands", s, "settings.json"), defaultSlug: () => def, accountOf: (s) => accounts[s] ?? "" });

describe("per-brand settings", () => {
  it("gives defaults for a brand with no file, and the shared defaults", () => {
    expect(store().get("acme")).toEqual(DEFAULT_SETTINGS);
    expect(store().getGlobal()).toEqual(DEFAULT_GLOBAL_SETTINGS);
    expect(store().getBrand("acme")).toEqual(DEFAULT_BRAND_SETTINGS);
  });
  it("keeps each brand's schedule, daily loop and factory rules apart, and shares Blender and the model", () => {
    const s = store({ acme: "acme_cafe", beta: "beta_shop" });
    const a = s.get("acme");
    s.set({ ...a, daily: { ...a.daily, enabled: true, earliest: "08:30" }, factory: { ...a.factory, concurrency: 4 }, blenderDevice: "cpu", claudeModel: "opus" }, "acme");
    const b = s.get("beta");
    expect(b.daily).toEqual(DEFAULT_SETTINGS.daily);
    expect(b.factory.concurrency).toBe(2);
    expect(b).toMatchObject({ blenderDevice: "cpu", claudeModel: "opus", accountName: "beta_shop" });
    expect(s.get("acme")).toMatchObject({ daily: { enabled: true, earliest: "08:30" }, accountName: "acme_cafe" });
    // what is on disk: brand file has the brand part only, the global file the shared part only
    expect(Object.keys(JSON.parse(readFileSync(join(tmp, "brands/acme/settings.json"), "utf8"))).sort()).toEqual(["daily", "factory", "slotPattern"]);
    expect(JSON.parse(readFileSync(join(tmp, "settings.json"), "utf8"))).toEqual({ blenderDevice: "cpu", claudeModel: "opus", assistant: { kind: "claude", command: "" } });
    expect(existsSync(join(tmp, "brands/beta/settings.json"))).toBe(false);
  });
  it("survives a restart and a corrupt file", () => {
    const s = store();
    s.set({ ...s.get("acme"), claudeModel: "sonnet" }, "acme");
    expect(store().get("acme").claudeModel).toBe("sonnet");
    writeFileSync(join(tmp, "brands/acme/settings.json"), "garbage");
    writeFileSync(join(tmp, "settings.json"), "[1]");
    expect(store().get("acme")).toEqual(DEFAULT_SETTINGS);
  });
  it("falls back to the keys of an old single-file settings.json until the brand has its own file", () => {
    writeFileSync(join(tmp, "settings.json"), JSON.stringify({ ...DEFAULT_SETTINGS, daily: { enabled: true, earliest: "07:00", ideas: 5, threads: false } }));
    expect(store().get("acme").daily).toMatchObject({ enabled: true, earliest: "07:00", ideas: 5 });
  });
  it("uses the default brand when none is named, and the defaults with no brand at all", () => {
    const s = store({ acme: "x" });
    s.set({ ...s.get(), daily: { ...DEFAULT_SETTINGS.daily, ideas: 7 } });
    expect(s.get("acme").daily.ideas).toBe(7);
    expect(store({}, null).get()).toEqual(DEFAULT_SETTINGS);
    expect(() => store({}, null).set(DEFAULT_SETTINGS)).toThrow(/No brand/);
    expect(() => store({}, null).getBrand()).toThrow(/No brand/);
  });
  it("forBrand is bound to one brand", () => {
    const s = store();
    s.set({ ...s.get("beta"), daily: { ...DEFAULT_SETTINGS.daily, enabled: true } }, "beta");
    expect(s.forBrand("beta").get().daily.enabled).toBe(true);
    expect(s.forBrand("acme").get().daily.enabled).toBe(false);
  });
  it("split and merge are inverse, and the merged schema validates", () => {
    const parts = splitSettings({ ...DEFAULT_SETTINGS, accountName: "a" });
    expect(mergeSettings(parts.brand, parts.global, "a")).toEqual({ ...DEFAULT_SETTINGS, accountName: "a" });
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, accountName: "bad name" }).success).toBe(false);
    mkdirSync(join(tmp, "x"));
  });
});
