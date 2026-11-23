import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeBrand } from "../src/brands/registry.js";
import { brandCreate } from "../src/creator/create-job.js";
import { readState, sheetFile } from "../src/creator/studio.js";
import { readScheduled } from "../src/reels/scanner.js";
import { DEFAULT_SETTINGS } from "../src/settings.js";
import { type Env, formBrand, job, makeEnv } from "./helpers/creator.js";
import { JPG, PNG, WAV } from "./helpers/zip.js";
import { writeTestBrand } from "./helpers/brand.js";

let env: Env;
beforeEach(() => { env = makeEnv(); });
afterEach(() => rmSync(env.tmp, { recursive: true, force: true }));

const create = (params: Record<string, unknown>, id = "a".repeat(32)) => brandCreate(job("brand.create", "acme-bakery", { source: "form", requestId: id, ...params }), env.ctx(job("brand.create", "acme-bakery", {})));
const read = (...p: string[]) => readFileSync(join(env.data, "brands", "acme-bakery", ...p), "utf8"); // a file of the brand the tests create

describe("brand.create from the form", () => {
  it("makes every folder and file and registers the brand", async () => {
    const r = await create({ brand: formBrand() });
    const b = env.reg.get("acme-bakery");
    expect(b?.name).toBe("Acme Bakery");
    expect(b?.instagram).toEqual({ account: "acme_bakery", userId: "" });
    for (const d of ["", "identity", "reels"]) expect(existsSync(join(env.data, "brands/acme-bakery", d)), d).toBe(true);
    expect(existsSync(join(env.data, "brands/acme-bakery/mascot"))).toBe(false); // no character, no mascot folder
    expect(existsSync(join(env.root, "brand")) || existsSync(join(env.root, "reels")) || existsSync(join(env.root, "characters")) || existsSync(join(env.root, "public"))).toBe(false); // nothing of a brand is written in the workspace
    const p = env.reg.paths("acme-bakery");
    for (const d of [p.dataDir, p.dailyDir, p.analyticsDir, p.ideasDir, p.locksDir, p.profileDir]) expect(existsSync(d), d).toBe(true);
    expect(read("identity/style.md")).toContain("Acme Bakery");
    expect(read("identity/style.md")).toContain("## About the brand");
    expect(read("identity/style.md")).not.toContain("## Mascot");
    expect(read("identity/style.md")).not.toContain("{{");
    expect(readFileSync(p.questionsMd, "utf8")).toMatch(/## Done\n\n## To do\n\n$/); // the question list is hub data
    expect(readFileSync(p.questionsMd, "utf8")).not.toContain("{{");
    expect(p.questionsMd).toBe(join(env.data, "brands/acme-bakery/reel-questions.md")); // at the top of the brand folder, next to identity/ and reels/
    expect(existsSync(join(env.data, "brands/acme-bakery/voice-sample.md"))).toBe(false);
    expect(r).toMatchObject({ slug: "acme-bakery", source: "form", daily: false, character: "none", logo: null, voice: null });
    expect(existsSync(join(env.data, "brands/acme-bakery/identity/logo.png"))).toBe(false);
    expect(read("identity/style.md")).toContain("No logo yet");
    expect(read("identity/style.md")).not.toContain("`identity/logo.png`");
    expect(read("identity/style.md")).toContain("identity/voice"); // no voice yet: the guide says where to save it
    expect(r.nextSteps).toHaveLength(3);
    expect(env.daily).toEqual([]);
    expect(env.svc.settings.get("acme-bakery").daily.enabled).toBe(false);
    expect(readScheduled(p.scheduledFile)).toEqual({});
  });

  it("stores a png logo, a voice upload and a character sheet, and starts the daily loop when asked", async () => {
    const logo = env.svc.uploads.put("logo", PNG), wav = env.svc.uploads.put("voice", WAV), sheet = env.svc.uploads.put("sheet", JPG);
    const r = await create({
      brand: formBrand(), logoUpload: logo.id, dailyLoop: true,
      voice: { mode: "upload", wavUpload: wav.id, text: "Hello, this is the voice." },
      character: { mode: "create", name: "Bun", fields: { what: "a round bun", personality: "cheerful", extra: "" }, sheetUpload: sheet.id },
    });
    expect(readFileSync(join(env.data, "brands/acme-bakery/identity/logo.png")).equals(PNG)).toBe(true);
    // The character is only a draft (not enabled), so the voice is the brand's own, in identity/.
    expect(readFileSync(join(env.data, "brands/acme-bakery/identity/voice.wav")).equals(WAV)).toBe(true);
    expect(read("identity/voice.txt")).toContain("Hello, this is the voice.");
    expect(env.reg.get("acme-bakery")?.voice).toMatchObject({ sample: "identity/voice.wav", sampleText: "identity/voice.txt" });
    expect(read("identity/style.md")).toContain("`identity/voice.wav`");
    expect(read("identity/style.md")).toContain("a round bun");
    expect(sheetFile(join(env.data, "brands/acme-bakery"))).toBe("reference-sheet.jpg");
    expect(readState(join(env.data, "brands/acme-bakery"))).toMatchObject({ name: "Bun", fields: { what: "a round bun" } });
    expect(env.reg.get("acme-bakery")?.character).toMatchObject({ enabled: false, name: "Bun" });
    expect(env.svc.settings.get("acme-bakery").daily.enabled).toBe(true);
    expect(env.daily).toEqual(["acme-bakery"]);
    expect(r.daily).toBe(true);
    expect(env.svc.uploads.get(logo.id, "logo")).toBeNull();
  });

  it("saves the closing keywords of the request in the brand's settings, once each", async () => {
    await create({ brand: formBrand(), closingRules: { product: ["Menu", "menu", "qr code"], general: ["tax", "QR code", "hiring"] } });
    const s = env.svc.settings.get("acme-bakery");
    expect(s.factory.closingRules).toEqual({ product: ["Menu", "qr code"], general: ["tax", "hiring"] });
    expect(s.daily.enabled).toBe(false);
  });

  it("keeps the settings defaults when the request has none or only empty lists", async () => {
    await create({ brand: formBrand() });
    expect(env.svc.settings.get("acme-bakery").factory.closingRules).toEqual({ product: [], general: [] });
    await create({ brand: formBrand("Other", "other"), closingRules: { product: [], general: [] } }, "b".repeat(32));
    expect(env.svc.settings.get("other").factory.closingRules).toEqual(DEFAULT_SETTINGS.factory.closingRules);
  });

  it("copies another brand's voice sample", async () => {
    writeTestBrand(env.root, "other", { voice: { engine: "voxcpm2", sample: "identity/voice.wav", sampleText: "identity/voice.txt" } });
    writeFileSync(join(env.data, "brands/other/identity/voice.wav"), WAV); writeFileSync(join(env.data, "brands/other/identity/voice.txt"), "Other words\n");
    writeFileSync(join(env.data, "brands/other/identity/voice.json"), '{ "speed": 0.9 }');
    await create({ brand: formBrand(), voice: { mode: "reuse", from: "other" } });
    expect(read("identity/voice.txt")).toContain("Other words");
    expect(read("identity/voice.json")).toContain("0.9"); // the voice settings come along
    expect(env.reg.get("acme-bakery")?.voice.sample).toBe("identity/voice.wav");
  });

  it("refuses a voice sample outside the other brand's folder", async () => {
    writeTestBrand(env.root, "other", { voice: { engine: "voxcpm2", sample: "../../secret.wav", sampleText: "identity/voice.txt" } });
    writeFileSync(join(env.data, "secret.wav"), WAV);
    await expect(create({ brand: formBrand(), voice: { mode: "reuse", from: "other" } })).rejects.toThrow(/no voice sample/);
    expect(existsSync(join(env.data, "brands/acme-bakery"))).toBe(false);
  });

  it("forces the profile folder, keeps a character import only when the mascot exists", async () => {
    await expect(create({ brand: formBrand(), character: { mode: "import", id: "bun", name: "Bun" } })).rejects.toThrow(/no character "bun"/);
    expect(existsSync(join(env.data, "brands/acme-bakery"))).toBe(false);
    // the character belongs to another brand: its files and rendered moves are copied into this brand's mascot folder
    writeTestBrand(env.root, "donor", { character: { enabled: true, id: "bun", name: "Bun" } });
    mkdirSync(join(env.data, "brands/donor/mascot/movements/idle"), { recursive: true });
    writeFileSync(join(env.data, "brands/donor/mascot/bun.py"), "# x"); writeFileSync(join(env.data, "brands/donor/mascot/bun-head.json"), "{}");
    writeFileSync(join(env.data, "brands/donor/mascot/bun-voice.wav"), WAV); // the donor's own voice is not copied
    writeFileSync(join(env.data, "brands/donor/mascot/movements/idle/f-0001.png"), "png"); writeFileSync(join(env.data, "brands/donor/mascot/movements/idle/info.json"), "{}");
    const wav = env.svc.uploads.put("voice", WAV);
    const r = await create({ brand: { ...formBrand(), instagram: { account: "a", userId: "1", profileDir: "/etc" } }, character: { mode: "import", id: "bun", name: "Bun" }, voice: { mode: "upload", wavUpload: wav.id, text: "My own words." } });
    const b = env.reg.get("acme-bakery");
    expect(b?.instagram).toEqual({ account: "a", userId: "1" });
    expect(b?.character).toMatchObject({ enabled: true, id: "bun" });
    expect(read("mascot/bun.py")).toBe("# x");
    expect(existsSync(join(env.data, "brands/acme-bakery/mascot/movements/idle/f-0001.png"))).toBe(true);
    // with a character, the voice is the character's: mascot/<id>-voice.*, and nothing in identity/
    expect(readFileSync(join(env.data, "brands/acme-bakery/mascot/bun-voice.wav")).equals(WAV)).toBe(true);
    expect(read("mascot/bun-voice.txt")).toContain("My own words.");
    expect(existsSync(join(env.data, "brands/acme-bakery/identity/voice.wav"))).toBe(false);
    expect(b?.voice).toMatchObject({ sample: "mascot/bun-voice.wav", sampleText: "mascot/bun-voice.txt" });
    expect(read("identity/style.md")).toContain("`mascot/bun-voice.wav`");
    expect((r as { files: string[] }).files.some((f) => f.includes("movements"))).toBe(false); // the summary does not list the rendered frames
  });

  it("adds the version when the request leaves it out", async () => {
    const { version: _v, ...noVersion } = formBrand() as Record<string, unknown>;
    await create({ brand: noVersion });
    expect(env.reg.get("acme-bakery")?.version).toBe(1);
  });

  it("rejects an invalid brand before touching the disk", async () => {
    await expect(create({ brand: { ...formBrand(), colors: { background: "white", text: "#000000", accent: "#111111", secondary: "#222222" } } })).rejects.toThrow(/colors/);
    await expect(create({ brand: { ...formBrand(), sources: { blogDir: "relative/dir" } } })).rejects.toThrow(/full folder path/);
    expect(existsSync(join(env.data, "brands/acme-bakery"))).toBe(false);
  });
});

describe("safety of brand.create", () => {
  it("never overwrites an existing brand, even with the same request twice by different ids", async () => {
    await create({ brand: formBrand() }, "1".repeat(32));
    const style = read("identity/style.md");
    writeFileSync(join(env.data, "brands/acme-bakery/identity/style.md"), "EDITED BY HAND");
    await expect(create({ brand: formBrand() }, "2".repeat(32))).rejects.toThrow(/already exists/);
    expect(read("identity/style.md")).toBe("EDITED BY HAND");
    expect(style).not.toBe("EDITED BY HAND");
  });
  it("is idempotent: the same request again returns the first summary and changes nothing", async () => {
    const first = await create({ brand: formBrand() }, "3".repeat(32));
    writeFileSync(join(env.data, "brands/acme-bakery/identity/style.md"), "EDITED");
    const again = await create({ brand: formBrand() }, "3".repeat(32));
    expect(again).toEqual(first);
    expect(read("identity/style.md")).toBe("EDITED");
  });
  it("refuses a slug whose folder exists but has no brand.json, and a hand-made brand", async () => {
    mkdirSync(join(env.data, "brands/acme-bakery/reels"), { recursive: true });
    await expect(create({ brand: formBrand() })).rejects.toThrow(/acme-bakery already exists/);
    expect(existsSync(join(env.data, "brands/acme-bakery/identity"))).toBe(false);
    writeBrand(env.data, writeTestBrand(env.root, "mine"));
    await expect(create({ brand: formBrand("Mine", "mine") })).rejects.toThrow(/already exists/);
  });
  it("cleans up leftovers of a cut-off run of the same request, then creates", async () => {
    const p = env.reg.paths("acme-bakery");
    mkdirSync(p.dataDir, { recursive: true }); writeFileSync(join(p.dataDir, ".created-by.json"), JSON.stringify({ requestId: "4".repeat(32) }));
    mkdirSync(join(env.data, "brands/acme-bakery"), { recursive: true }); writeFileSync(join(env.data, "brands/acme-bakery/half.txt"), "x");
    await create({ brand: formBrand() }, "4".repeat(32));
    expect(existsSync(join(env.data, "brands/acme-bakery/half.txt"))).toBe(false);
    expect(env.reg.has("acme-bakery")).toBe(true);
  });
  it("rolls back everything it created when a step fails", async () => {
    const sheet = env.svc.uploads.put("sheet", PNG);
    // a staged file that vanishes between the check and the use: the sheet read inside the creation fails after folders exist
    const bad = { ...env.svc, uploads: { ...env.svc.uploads, read: (id: string, kind: "sheet") => { if (kind === "sheet") throw new Error("disk full"); return env.svc.uploads.read(id, kind); }, get: env.svc.uploads.get.bind(env.svc.uploads), dir: env.svc.uploads.dir, remove: () => undefined } } as unknown as typeof env.svc;
    const ctx = { ...env.ctx(job("brand.create", "acme-bakery", {})), creator: bad };
    await expect(brandCreate(job("brand.create", "acme-bakery", { source: "form", requestId: "5".repeat(32), brand: formBrand(), character: { mode: "create", name: "Bun", sheetUpload: sheet.id } }), ctx)).rejects.toThrow(/disk full/);
    expect(existsSync(join(env.data, "brands")) ? readdirSync(join(env.data, "brands")) : []).toEqual([]); // nothing of the failed brand is left
    expect(existsSync(env.reg.paths("acme-bakery").dataDir)).toBe(false);
    expect(existsSync(env.reg.paths("acme-bakery").profileDir)).toBe(false);
    expect(env.patches.some((p) => String(p.log).includes("Rolled back"))).toBe(true);
  });
  it("needs the creator services", async () => {
    await expect(brandCreate(job("brand.create", "x", {}), { ...env.ctx(job("brand.create", "x", {})), creator: undefined })).rejects.toThrow(/not available/);
  });
});

describe("brand.create from an import", () => {
  it("takes style, questions, logo and voice from the staged folder", async () => {
    const { stageBundle } = await import("../src/creator/bundle.js");
    const id = stageBundle(env.svc.uploads.dir, new Map([["style.md", Buffer.from("# Imported style")], ["reel-questions.md", Buffer.from("## Done\n\n## To do\n\n- [ ] Q? · hook: myth · source: needs source\n")], ["logo.png", PNG], ["voice.wav", WAV], ["voice.txt", Buffer.from("Words")]]));
    const brand = { ...formBrand(), voice: { engine: "voxcpm2", sample: "identity/voice.wav", sampleText: "identity/voice.txt" } };
    await create({ source: "import", importId: id, brand });
    expect(read("identity/style.md")).toContain("# Imported style");
    expect(readFileSync(env.reg.paths("acme-bakery").questionsMd, "utf8")).toContain("Q?");
    expect(readFileSync(join(env.data, "brands/acme-bakery/identity/logo.png")).equals(PNG)).toBe(true);
    expect(readFileSync(join(env.data, "brands/acme-bakery/identity/voice.wav")).equals(WAV)).toBe(true);
    expect(read("identity/voice.txt")).toBe("Words");
    expect(env.reg.get("acme-bakery")?.voice.sample).toBe("identity/voice.wav");
    expect(env.svc.uploads.get(id, "zip")).toBeNull();
    await expect(create({ source: "import", importId: id, brand: formBrand("Other", "other") }, "7".repeat(32))).rejects.toThrow(/gone/);
  });
});

it("settings defaults stay untouched by the creator", () => { expect(DEFAULT_SETTINGS.assistant).toEqual({ kind: "claude" }); });
