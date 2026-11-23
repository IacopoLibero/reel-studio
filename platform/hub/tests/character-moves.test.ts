import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BASE_MOVES, buildMovesPrompt, characterId, characterMoves, checkMoves } from "../src/creator/moves-job.js";
import { mascotComponent } from "../src/character/mascot-component.js";
import { parseCharacterPy, parseMascotTs } from "../src/character/moves-parser.js";
import { listMoves, mascotTs } from "../src/character/gallery.js";
import { readBrand } from "../src/brands/registry.js";
import { buildSpec, createSchema } from "../src/jobs/create.js";
import { brandCtx } from "../src/brands/context.js";
import { DEFAULT_SETTINGS } from "../src/settings.js";
import { patchState, readState, saveSheet } from "../src/creator/studio.js";
import { type Env, job, makeEnv } from "./helpers/creator.js";
import { PNG } from "./helpers/zip.js";
import { writeTestBrand } from "./helpers/brand.js";

const FAKE = join(import.meta.dirname, "fixtures/fake-claude-moves.mjs");
let env: Env;
beforeEach(() => { env = makeEnv({ claudeBin: FAKE }); writeTestBrand(env.root, "acme", { name: "Acme" }, undefined, env.data); });
afterEach(() => { delete process.env.FAKE_MODE; rmSync(env.tmp, { recursive: true, force: true }); });
const brandDir = () => join(env.data, "brands", "acme");
const run = () => characterMoves(job("character.moves", "acme", {}), env.ctx(job("character.moves", "acme", {})));

describe("the prompt", () => {
  const p = buildMovesPrompt({ root: "/r", mascotDir: "/d/brands/acme/mascot", id: "bun", name: "Bun", faces: ["happy", "sad"], example: null });
  it("states the contract the hub parses", () => {
    expect(p).toContain("Write /d/brands/acme/mascot/bun.py: ");
    expect(p).toContain('"idle": (m_idle, 48)');
    expect(p).toContain('"happy": (m_happy, 48)');
    expect(p).toContain('LOOP_FROM = {"happy": 8, "sad": 8}');
    expect(p).toMatch(/f-NNNN\.png.*o-NNNN\.png/s);
    expect(p).toContain("bash scripts/slot.sh blender 1 -- ");
  });
  it("is readable by the same parser that reads a hand-made script", () => {
    const line = /MOVES = \{[^}]*\}/.exec(p)?.[0] ?? "";
    expect(Object.keys(parseCharacterPy(line).moves)).toEqual([...Object.keys(BASE_MOVES), "happy", "sad"]);
  });
});

describe("characterId", () => {
  it("makes a safe id from a name", () => {
    expect(characterId("Bun the Baker")).toBe("bun-the-baker");
    expect(characterId("12 ä")).toBe("character");
    expect(characterId("")).toBe("character");
  });
});

describe("the generated Mascot component", () => {
  const src = mascotComponent({ frames: { idle: 48, talk: 36, happy: 48 }, loopFrom: { happy: 8 } }, "Bun");
  it("is read back by the parser the Character page uses", () => {
    expect(parseMascotTs(src)).toEqual({ frames: { idle: 48, talk: 36, happy: 48 }, loopFrom: { happy: 8 } });
    expect(src).toContain('new Set<Move>(["idle", "talk"])');
    expect(src).toContain("export const mouthOpen");
  });
});

describe("character.moves with a fake claude", () => {
  beforeEach(() => { saveSheet(brandDir(), PNG); patchState(brandDir(), { name: "Bun", status: "approved" }); });
  it("renders the moves and makes the character the brand's", async () => {
    const r = await run();
    expect(r).toMatchObject({ character: "bun", moves: ["idle", "talk", "wave"], experimental: true });
    expect(readBrand(env.data, "acme")?.character).toEqual({ enabled: true, id: "bun", name: "Bun" });
    expect(readState(brandDir()).status).toBe("built");
    const mascot = readFileSync(mascotTs(join(brandDir(), "mascot")), "utf8");
    expect(parseMascotTs(mascot).frames).toEqual({ idle: 4, talk: 3, wave: 2 });
    expect(parseMascotTs(mascot).loopFrom).toEqual({ wave: 1 });
    expect(listMoves(join(brandDir(), "mascot"), "bun").filter((m) => m.rendered).map((m) => m.name)).toEqual(["idle", "talk", "wave"]);
    expect(env.patches.map((p) => p.step).filter(Boolean)).toEqual(["Read the preview", "Write the character script", "Render the moves", "Check the frames"]);
  });
  it("moves a voice sample from identity/ to the character", async () => {
    const id = join(brandDir(), "identity");
    writeFileSync(join(id, "voice.wav"), "w"); writeFileSync(join(id, "voice.txt"), "t");
    await run();
    expect(existsSync(join(brandDir(), "mascot", "bun-voice.wav"))).toBe(true);
    expect(existsSync(join(id, "voice.wav"))).toBe(false);
  });
  it("adds the character to the style guide", async () => {
    const f = join(brandDir(), "identity", "style.md");
    writeFileSync(f, "# Style\n\n## Look\n- flat\n");
    await run();
    expect(readFileSync(f, "utf8")).toMatch(/## Mascot\n- Bun/);
  });
  it("keeps a Mascot.tsx that already exists", async () => {
    const f = mascotTs(join(brandDir(), "mascot")); mkdirSync(join(f, ".."), { recursive: true }); writeFileSync(f, "// mine\n");
    await run();
    expect(readFileSync(f, "utf8")).toBe("// mine\n");
  });
  it("fails when the script is missing or the talk move was not rendered, and leaves the brand alone", async () => {
    process.env.FAKE_MODE = "noscript";
    await expect(run()).rejects.toThrow(/idle and talk were not rendered/);
    process.env.FAKE_MODE = "notalk";
    await expect(run()).rejects.toThrow(/talk were not rendered/);
    expect(readBrand(env.data, "acme")?.character.enabled).toBe(false);
    expect(readState(brandDir()).status).toBe("approved");
  });
  it("needs an approved preview", async () => {
    patchState(brandDir(), { status: "preview" });
    await expect(run()).rejects.toThrow(/Approve a preview/);
  });
});

describe("checkMoves", () => {
  it("counts only moves with info.json and all their f- and o- frames", () => {
    const mascot = join(brandDir(), "mascot"); mkdirSync(join(mascot, "movements/idle"), { recursive: true });
    writeFileSync(join(mascot, "x.py"), 'MOVES = {"idle": (m_idle, 2)}\n');
    writeFileSync(join(mascot, "movements/idle/f-0001.png"), "x");
    expect(checkMoves(mascot, "x").unrendered).toEqual(["idle"]);
  });
});

describe("creating the job", () => {
  const mk = () => ({ root: env.root, brand: brandCtx(env.reg, "acme"), settings: DEFAULT_SETTINGS, jobs: [] });
  it("is accepted only after approval", () => {
    const body = createSchema.parse({ type: "character.moves" });
    expect(() => buildSpec(body, mk())).toThrow(/Approve a preview/);
    patchState(brandDir(), { status: "approved" });
    expect(buildSpec(body, mk()).title).toMatch(/moves/);
  });
});
