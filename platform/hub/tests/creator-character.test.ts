import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCharacterPrompt, characterBuild, characterTools } from "../src/creator/character-job.js";
import { buildSpec, createSchema } from "../src/jobs/create.js";
import { brandCtx } from "../src/brands/context.js";
import { DEFAULT_SETTINGS } from "../src/settings.js";
import { listPreviews, patchState, readState, saveSheet, sheetFile } from "../src/creator/studio.js";
import { blenderCommand } from "../src/character/prompt.js";
import { adaptStyle, emptyQuestions } from "../src/creator/style.js";
import { testBrand } from "./helpers/brand.js";
import { type Env, job, makeEnv } from "./helpers/creator.js";
import { PNG } from "./helpers/zip.js";
import { writeTestBrand } from "./helpers/brand.js";

const FAKE = join(import.meta.dirname, "fixtures/fake-claude-character.mjs");
let env: Env;
beforeEach(() => { env = makeEnv({ claudeBin: FAKE }); writeTestBrand(env.root, "acme", { name: "Acme" }, undefined, env.data); });
/** The folder of the brand "acme": the character studio is its mascot/studio. */
const dir = () => join(env.data, "brands", "acme");
afterEach(() => { delete process.env.FAKE_MODE; rmSync(env.tmp, { recursive: true, force: true }); });
const run = (params: Record<string, unknown> = {}) => characterBuild(job("character.build", "acme", params), env.ctx(job("character.build", "acme", params)));

describe("the character studio files", () => {
  it("keeps the sheet, the state and the previews under brand/<slug>/mascot/studio", () => {
    expect(sheetFile(dir())).toBeNull();
    expect(saveSheet(dir(), PNG)).toBe("reference-sheet.png");
    expect(existsSync(join(env.data, "brands/acme/mascot/studio/reference-sheet.png"))).toBe(true);
    expect(() => saveSheet(dir(), Buffer.from("nope"))).toThrow(/PNG or a JPG/);
    expect(readState(dir()).status).toBe("draft");
    expect(patchState(dir(), { name: "Bun" }).name).toBe("Bun");
    expect(listPreviews(dir())).toEqual([]);
    writeFileSync(join(env.data, "brands/acme/mascot/studio/state.json"), "{broken");
    expect(readState(dir()).name).toBe("");
  });
});

describe("character.build with a fake claude", () => {
  beforeEach(() => { saveSheet(dir(), PNG); });
  it("writes a plan and builder and ends with a preview for approval", async () => {
    const r = await run();
    expect(r).toMatchObject({ previews: ["front.png"], experimental: true, plan: { parts: 1 } });
    expect(JSON.parse(readFileSync(join(env.data, "brands/acme/mascot/studio/plan.json"), "utf8")).character).toBe("Bun");
    expect(readState(dir())).toMatchObject({ status: "preview", builds: 1 });
    expect(env.patches.map((p) => p.step).filter(Boolean)).toEqual(["Read the sheet", "Plan", "Write the builder", "Render previews", "Done"]);
  });
  it("reruns with the person's notes and passes all of them to Claude", async () => {
    await run({ notes: "Make the arms shorter" });
    const second = await run({ notes: "Bigger eyes" });
    expect(second.summary).toBe("Built again with your notes.");
    expect(readState(dir()).notes).toEqual(["Make the arms shorter", "Bigger eyes"]);
    expect(readState(dir()).builds).toBe(2);
  });
  it("fails clearly when there is no sheet, no plan, no preview, or Claude errors", async () => {
    rmSync(join(env.data, "brands/acme/mascot/studio/reference-sheet.png"));
    await expect(run()).rejects.toThrow(/no reference sheet/);
    saveSheet(dir(), PNG);
    process.env.FAKE_MODE = "noplan";
    await expect(run()).rejects.toThrow(/plan\.json/);
    process.env.FAKE_MODE = "nopreview";
    rmSync(join(env.data, "brands/acme/mascot/studio/previews"), { recursive: true, force: true });
    await expect(run()).rejects.toThrow(/no new preview/);
    process.env.FAKE_MODE = "error";
    await expect(run()).rejects.toThrow(/boom/);
    expect(readState(dir()).status).toBe("draft");
  });
  it("needs a brand", async () => {
    await expect(characterBuild(job("character.build", undefined, {}), { ...env.ctx(job("character.build", "acme", {})), brand: null })).rejects.toThrow(/needs a brand/);
  });
});

describe("character.build safety and job creation", () => {
  it("can only write inside the brand's character folder and cannot read credentials", () => {
    const t = characterTools(join(dir(), "mascot", "studio"));
    expect(t.allowed).toContain(`Write(/${join(dir(), "mascot", "studio")}/**)`); // an absolute path in a rule starts with //
    expect(t.allowed).toContain(`Edit(/${join(dir(), "mascot", "studio")}/**)`);
    expect(t.allowed).not.toMatch(/Bash\(\*|,Bash,|WebFetch/);
    expect(t.allowed).toContain("Bash(bash scripts/slot.sh blender 1 --:*)");
    expect(t.denied).toContain("Read(**/.env)");
    expect(t.denied).toContain("Bash(docker:*)");
  });
  it("tells Claude about the sheet, the colours, the notes, the Blender queue and that it is experimental", () => {
    const p = buildCharacterPrompt({ root: "/p", studio: "/d/brands/acme/mascot/studio", brand: testBrand("acme", { name: "Acme" }), sheet: "reference-sheet.png", notes: ["shorter arms"], fields: { what: "a bun", personality: "kind", extra: "" }, mascotExample: "mascot/x.py" });
    for (const t of ["EXPERIMENTAL", "/d/brands/acme/mascot/studio/reference-sheet.png", "#2f6fed", "shorter arms", "bash scripts/slot.sh blender 1 --", "BLENDER_WORKBENCH", "mascot/x.py", "write only inside /d/brands/acme/mascot/studio/", "a bun"]) expect(p).toContain(t);
    expect(buildCharacterPrompt({ root: "/p", studio: "/d/brands/acme/mascot/studio", brand: testBrand("acme"), sheet: "s.png", notes: [], fields: { what: "", personality: "", extra: "" }, mascotExample: null })).not.toContain("For the method only");
  });
  it("uses the blender-run wrapper when it is on the path, the flatpak otherwise", () => {
    expect(blenderCommand("/s.py", ["preview"], "/nowhere").cmd).toBe("flatpak");
    const dir = join(env.tmp, "bin"); mkdirSync(dir); writeFileSync(join(dir, "blender-run"), "");
    expect(blenderCommand("/s.py", ["preview"], dir)).toMatchObject({ cmd: "blender-run", text: "blender-run -b -P /s.py -- preview" });
  });
  it("is created only with a sheet, once at a time", () => {
    const brand = brandCtx(env.reg, "acme")!;
    const body = createSchema.parse({ type: "character.build", params: { notes: "  more red  " } });
    const deps = (jobs = [] as never[]) => ({ root: env.root, brand, settings: DEFAULT_SETTINGS, jobs });
    expect(() => buildSpec(body, deps())).toThrow(/reference sheet/);
    saveSheet(dir(), PNG);
    const spec = buildSpec(body, deps());
    expect(spec).toMatchObject({ type: "character.build", brand: "acme", params: { notes: "more red" } });
    expect(() => buildSpec(body, deps([{ ...job("character.build", "acme", {}), status: "queued" }] as never[]))).toThrow(/already running/);
  });
});

describe("style.md and the question list of a new brand", () => {
  const filled = readFileSync(join(import.meta.dirname, "../../../brand/_template/style.md"), "utf8");
  it("drops the mascot section without a character and keeps it with one", () => {
    const b = testBrand("acme", { name: "Acme" });
    expect(adaptStyle(filled, b, { logo: null, voice: false })).not.toContain("## Mascot");
    const withMascot = adaptStyle(filled, b, { logo: null, voice: false, mascot: "a bun" });
    expect(withMascot).toContain("- a bun");
    expect(withMascot).not.toContain("delete this section");
    expect(adaptStyle(filled, b, { logo: null, voice: false })).toContain("No voice sample yet");
  });
  it("keeps the explanation of the question list and removes the example question", () => {
    const q = readFileSync(join(import.meta.dirname, "../../../brand/_template/reel-questions.md"), "utf8");
    const e = emptyQuestions(q, "Acme");
    expect(e).toContain("How to use");
    expect(e).not.toContain("{{");
    expect(e.endsWith("## Done\n\n## To do\n\n")).toBe(true);
    expect(emptyQuestions("no headings", "Acme")).toContain("# Reel questions: Acme");
  });
});
