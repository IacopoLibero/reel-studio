import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateLegacyData } from "../src/brands/migrate.js";
import { readBrand } from "../src/brands/registry.js";
import { seedBrand } from "../src/brands/seed.js";
import { SettingsStore } from "../src/settings.js";
import { JobStore } from "../src/jobs/store.js";
import { writeTestBrand } from "./helpers/brand.js";

const STYLE = `# My look

Brand: Acme Cafe (https://acme.example/). Colours and fonts match the site.

## Colours
- Background: \`#f5f0e8\` (beige)
- Text: \`#111111\`
- Accent: \`#d94a3d\` (red). Use only on what matters.
- Secondary accent (rare): \`#854dff\` (purple)

## Fonts
- Headlines and big words: **Oswald** (bold)
- Captions and small text: **Inter**
`;
const LEGACY_SETTINGS = { factory: { concurrency: 3, closingRules: { product: ["menu"], general: ["tip"] } }, daily: { enabled: true, earliest: "07:15", ideas: 4, threads: false }, blenderDevice: "cpu", claudeModel: "sonnet", accountName: "acme_cafe", slotPattern: { timezone: "Europe/London", days: [["08:00"], [], [], [], [], [], []] } };

let tmp: string, root: string, data: string, chrome: string, logs: string[];
const opts = (env: NodeJS.ProcessEnv = {}) => ({ root, dataDir: data, chromeRoot: chrome, env, now: new Date("2026-11-19T20:30:00Z"), log: (m: string) => logs.push(m) });

function legacyLayout() {
  mkdirSync(join(root, "brand/acme"), { recursive: true });
  writeFileSync(join(root, "brand/acme/style.md"), STYLE);
  writeFileSync(join(root, "brand/acme/reel-questions.md"), "## To do\n");
  mkdirSync(join(root, "mascot"), { recursive: true }); writeFileSync(join(root, "mascot/pip.py"), "# blender script");
  writeFileSync(join(data, "settings.json"), JSON.stringify(LEGACY_SETTINGS));
  writeFileSync(join(data, "scheduled.json"), JSON.stringify({ "acme/1-a": { slot: "2026-11-25T08:00", scheduledAt: "x", verified: true } }));
  writeFileSync(join(data, "series.json"), "[]");
  writeFileSync(join(data, "notifications.json"), "[]");
  for (const d of ["daily", "analytics", "ideas", "locks", "shots"]) mkdirSync(join(data, d));
  writeFileSync(join(data, "daily/2026-11-19.json"), "{}");
  writeFileSync(join(data, "analytics/hooks.csv"), "a,b\n1,2\n");
  writeFileSync(join(data, "ideas/b.json"), "{}");
  writeFileSync(join(data, "dev-token"), "secret");
  const old = { id: "1", type: "analytics.collect", title: "t", status: "done", params: {} };
  const named = { id: "2", type: "reel.make", title: "t", status: "done", params: { brand: "acme" } };
  const tagged = { id: "3", type: "reel.make", title: "t", status: "done", brand: "other", params: {} };
  const stray = { id: "4", type: "reel.ideas", title: "t", status: "done", params: { brand: "unknown-brand" } };
  writeFileSync(join(data, "jobs.json"), JSON.stringify([old, named, tagged, stray]));
  mkdirSync(join(chrome, "Default"), { recursive: true }); writeFileSync(join(chrome, "Local State"), "{}");
}

beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "migrate-")); root = join(tmp, "root"); data = join(tmp, "data"); chrome = join(tmp, "chrome-profile"); mkdirSync(root); mkdirSync(data); logs = []; });
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("migrating the single-brand layout", () => {
  it("backs up, writes brand.json, moves the data, splits the settings and tags the jobs", () => {
    legacyLayout();
    const r = migrateLegacyData(opts({ BRAND: "acme", IG_USER_ID: "12345", IG_ACCOUNT: "acme_cafe", OFFER_LAST_DAY: "2026-11-30", OFFER_REGEX: "ACMEFREE", HUB_BLOG_DIR: "/posts" }));
    expect(r).toMatchObject({ status: "migrated", slug: "acme", jobsTagged: 3 });
    expect(r.moved.sort()).toEqual(["analytics", "daily", "ideas", "locks", "notifications.json", "scheduled.json", "series.json", "shots"]);

    // backup: a full copy, without the token or the Chrome profile, with a note
    const backup = r.backup as string;
    expect(readdirSync(backup).sort()).toEqual(["NOTE.txt", "analytics", "daily", "ideas", "jobs.json", "locks", "notifications.json", "scheduled.json", "series.json", "settings.json", "shots"]);
    expect(readFileSync(join(backup, "NOTE.txt"), "utf8")).toContain(chrome);
    expect(JSON.parse(readFileSync(join(backup, "settings.json"), "utf8")).accountName).toBe("acme_cafe");

    // brand.json from style.md and the .env values
    const b = readBrand(root, "acme")!;
    expect(b).toMatchObject({
      name: "Acme Cafe", website: "acme.example", colors: { background: "#f5f0e8", text: "#111111", accent: "#d94a3d", secondary: "#854dff" },
      fonts: { headline: "Oswald", body: "Inter" }, offer: { lastDay: "2026-11-30", regex: "ACMEFREE" },
      instagram: { account: "acme_cafe", userId: "12345", profileDir: chrome }, sources: { blogDir: "/posts" }, character: { enabled: true, id: "pip", name: "Pip" },
    });

    // data moved into the brand folder, nothing left behind at the top
    const bdata = join(data, "brands/acme");
    expect(JSON.parse(readFileSync(join(bdata, "scheduled.json"), "utf8"))["acme/1-a"].slot).toBe("2026-11-25T08:00");
    expect(existsSync(join(bdata, "daily/2026-11-19.json"))).toBe(true);
    expect(existsSync(join(bdata, "analytics/hooks.csv"))).toBe(true);
    for (const n of ["scheduled.json", "daily", "analytics", "ideas", "series.json", "notifications.json", "locks", "shots"]) expect(existsSync(join(data, n)), n).toBe(false);
    expect(existsSync(join(data, "dev-token"))).toBe(true);

    // settings split: brand part in the brand folder, shared part stays global
    expect(JSON.parse(readFileSync(join(bdata, "settings.json"), "utf8"))).toMatchObject({ factory: { concurrency: 3 }, daily: { enabled: true, earliest: "07:15", ideas: 4 }, slotPattern: { timezone: "Europe/London" } });
    expect(JSON.parse(readFileSync(join(data, "settings.json"), "utf8"))).toEqual({ blenderDevice: "cpu", claudeModel: "sonnet", assistant: { kind: "claude", command: "" } });

    // jobs keep their order and gain a brand; a brand already set is kept; an unknown brand in params falls back to the migrated one
    const jobs = JSON.parse(readFileSync(join(data, "jobs.json"), "utf8")) as { id: string; brand: string }[];
    expect(jobs.map((j) => [j.id, j.brand])).toEqual([["1", "acme"], ["2", "acme"], ["3", "other"], ["4", "acme"]]);
    expect(logs.join("\n")).toMatch(/backup written/);
    expect(readFileSync(join(bdata, "migration.log"), "utf8")).toMatch(/migrated from the single-brand layout/);
  });

  it("is idempotent: a second start changes nothing and makes no second backup", () => {
    legacyLayout();
    const first = migrateLegacyData(opts({ BRAND: "acme" }));
    const before = readdirSync(data).sort();
    const second = migrateLegacyData(opts({ BRAND: "acme" }));
    expect(second.status).toBe("already");
    expect(readdirSync(data).sort()).toEqual(before);
    expect(readdirSync(data).filter((n) => n.startsWith("backup-"))).toHaveLength(1);
    expect(first.backup).toContain("backup-pre-brands-20261119-203000");
  });

  it("resumes after a partial run: what is done stays, what is missing is moved, one backup", () => {
    legacyLayout();
    migrateLegacyData(opts({ BRAND: "acme" }));
    rmSync(join(data, ".brands-migrated.json"));
    writeFileSync(join(data, "series.json"), "[{\"late\":true}]");
    const r = migrateLegacyData(opts({ BRAND: "acme" }));
    expect(r.status).toBe("migrated");
    expect(r.skipped).toEqual(["series.json"]);
    expect(readFileSync(join(data, "series.json"), "utf8")).toContain("late");
    expect(readFileSync(join(data, "brands/acme/series.json"), "utf8")).toBe("[]");
    expect(readdirSync(data).filter((n) => n.startsWith("backup-"))).toHaveLength(1);
    expect(r.jobsTagged).toBe(0);
  });

  it("keeps an existing brand.json untouched and does not point the profile at an empty folder", () => {
    legacyLayout();
    rmSync(chrome, { recursive: true });
    const mine = writeTestBrand(root, "acme", { name: "Mine", colors: { background: "#000000", text: "#ffffff", accent: "#ff0000", secondary: "#00ff00" } });
    migrateLegacyData(opts({ BRAND: "acme", IG_USER_ID: "999" }));
    expect(readBrand(root, "acme")).toEqual(mine);
  });

  it("does nothing on a fresh install, with no brand folder, or without a data folder", () => {
    expect(migrateLegacyData({ ...opts(), dataDir: join(tmp, "missing") }).status).toBe("nothing");
    expect(migrateLegacyData(opts()).status).toBe("nothing");
    writeFileSync(join(data, "scheduled.json"), "{}");
    expect(migrateLegacyData(opts()).status).toBe("no-brand");
    expect(existsSync(join(data, "scheduled.json"))).toBe(true);
    expect(readdirSync(data).filter((n) => n.startsWith("backup-"))).toHaveLength(0);
  });

  it("picks the first brand folder when BRAND is not set, and ignores a BRAND that has no folder", () => {
    legacyLayout();
    mkdirSync(join(root, "brand/zeta"), { recursive: true });
    expect(migrateLegacyData(opts({ BRAND: "ghost" })).slug).toBe("acme");
  });

  it("the migrated layout works with the stores: settings per brand, jobs tagged", () => {
    legacyLayout();
    migrateLegacyData(opts({ BRAND: "acme" }));
    const brandFile = (s: string) => join(data, "brands", s, "settings.json");
    const settings = new SettingsStore(join(data, "settings.json"), { brandFile, defaultSlug: () => "acme", accountOf: () => "acme_cafe" });
    expect(settings.get()).toMatchObject({ blenderDevice: "cpu", claudeModel: "sonnet", accountName: "acme_cafe", daily: { earliest: "07:15" } });
    const store = new JobStore(join(data, "jobs.json"));
    expect(store.list().every((j) => typeof j.brand === "string")).toBe(true);
  });
});

describe("seeding brand.json", () => {
  it("falls back to neutral values when style.md says nothing, and to defaults when a value does not validate", () => {
    mkdirSync(join(root, "brand/plain-cafe"), { recursive: true });
    const b = seedBrand({ root, slug: "plain-cafe", env: {} });
    expect(b).toMatchObject({ name: "Plain Cafe", website: "", colors: { accent: "#2f6fed" }, character: { enabled: false }, voice: { sample: null } });
    const bad = seedBrand({ root, slug: "plain-cafe", env: { OFFER_REGEX: "(", IG_USER_ID: "12ab" } });
    expect(bad.offer).toEqual({ lastDay: null, regex: null });
    expect(seedBrand({ root, slug: "plain-cafe", env: { OFFER_LAST_DAY: "soon", IG_USER_ID: "55" } }).instagram.userId).toBe("55");
  });
  it("finds a voice sample next to the brand files", () => {
    mkdirSync(join(root, "brand/acme"), { recursive: true });
    writeFileSync(join(root, "brand/acme/pip-voice.wav"), ""); writeFileSync(join(root, "brand/acme/pip-voice.txt"), "hi");
    expect(seedBrand({ root, slug: "acme", env: {} }).voice).toMatchObject({ sample: "pip-voice.wav", sampleText: "pip-voice.txt" });
  });
});
