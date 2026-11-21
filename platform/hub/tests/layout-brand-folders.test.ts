import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findOldBrands, migrateBrandFolders, removeOldFiles, updateStyleGuide } from "../src/layout/brand-folders.js";
import { readBrand } from "../src/brands/registry.js";
import { testBrand } from "./helpers/brand.js";

let tmp: string, ws: string, data: string;
const put = (rel: string, content: string | Buffer = "x", base = ws) => { const f = join(base, rel); mkdirSync(join(f, ".."), { recursive: true }); writeFileSync(f, content); return f; };
const read = (rel: string, base = ws) => readFileSync(join(base, rel), "utf8");

const STYLE = [
  "- Chosen voice: **Pip** only, cloned from `brand/acme/pip-voice.wav` (its words are in `pip-voice.txt` next to it). See `voice-sample.md` in this folder for how to record it.",
  "- Pip is built in Blender (`mascot/pip.py`, model `mascot/pip.blend`), moves in `public/mascot/<move>/`.",
  "- Brand: Acme, `acme.example`. Logo: `brand/acme/logo.png`. Work in `reels/acme/3-first/`; not `reels/other/1-x/`.",
].join("\n");

/** A workspace in the first layout: brand "acme" with a character, a voice, a logo, one reel with audio, and "plain" with nothing. */
function oldWorkspace(): void {
  const acme = testBrand("acme", { name: "Acme", character: { enabled: true, id: "pip", name: "Pip" }, voice: { engine: "voxcpm2", sample: "pip-voice.wav", sampleText: "pip-voice.txt" } });
  put("brand/acme/brand.json", JSON.stringify(acme)); put("brand/acme/style.md", STYLE); put("brand/acme/logo.png", "LOGO");
  put("brand/acme/pip-voice.wav", "WAV"); put("brand/acme/pip-voice.txt", "words"); put("brand/acme/pip-voice.json", '{ "speed": 0.9 }');
  put("brand/acme/reel-questions.md", "## To do\n"); put("brand/acme/voice-sample.md", "guide"); put("brand/acme/hooks.csv", "a,b");
  put("reels/acme/3-first/a.mp4", "VIDEO"); put("reels/acme/3-first/audio/pip.wav", "FINAL"); put("reels/acme/3-first/audio/pip-0.wav", "piece"); put("reels/acme/3-first/caption.md", "cap");
  put("reels/acme/4-second/a.mp4", "VIDEO2"); put("public/4-second/pip.wav", "ONLY-IN-PUBLIC");
  put("public/3-first/pip.wav", "FINAL"); put("public/mascot/idle/f-0001.png", "FRAME"); put("public/mascot/idle/info.json", "{}"); put("public/a1/ding.wav", "ding");
  put("mascot/pip.py", "script"); put("mascot/pip.blend", "blend"); put("mascot/pip-expressions.png", "sheet"); put("mascot/work/head.json", "{}");
  put("characters/acme/state.json", "{}"); put("characters/acme/previews/front.png", "png");
  put("brand/plain/brand.json", JSON.stringify(testBrand("plain", { name: "Plain" }))); put("brand/plain/style.md", "# plain"); put("brand/plain/voice-sample.md", "guide");
  put("brand/_template/brand.json", "{}");
}
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "brand-folders-")); ws = join(tmp, "workspace"); data = join(tmp, "data"); mkdirSync(ws); mkdirSync(data); });
afterEach(() => rmSync(tmp, { recursive: true, force: true }));
const run = (apply: boolean) => migrateBrandFolders({ workspace: ws, data, apply });

describe("finding the brands to move", () => {
  it("lists brand folders with a brand.json at the top and no identity folder yet", () => {
    oldWorkspace();
    expect(findOldBrands(ws)).toEqual(["acme", "plain"]);
    put("brand/done/identity/brand.json", "{}"); put("brand/done/brand.json", "{}");
    expect(findOldBrands(ws)).toEqual(["acme", "plain"]);
  });
  it("finds nothing in a workspace that is already in the new layout, or empty", () => {
    expect(run(true).status).toBe("nothing");
    put("brand/new/identity/brand.json", "{}");
    expect(run(true).status).toBe("nothing");
  });
});

describe("the plan", () => {
  it("shows what would be copied and changes nothing", () => {
    oldWorkspace();
    const r = run(false);
    expect(r.status).toBe("planned");
    expect(r.problems).toEqual([]);
    const acme = r.brands.find((b) => b.slug === "acme")!;
    expect(acme.copies.map((c) => c.what).sort()).toEqual(["character model", "character script", "character studio", "expression sheet", "final audio of 4-second", "head shape", "logo", "question list", "reels", "rendered moves", "voice sample", "voice settings", "words of the voice sample"].sort());
    expect(existsSync(join(ws, "brand/acme/identity"))).toBe(false);
    expect(existsSync(join(data, "brands"))).toBe(false);
    expect(r.leftovers.some((p) => p.endsWith("brand/acme/brand.json"))).toBe(true);
  });
  it("stops on a brand.json that is not valid and on a character script that is missing", () => {
    put("brand/bad/brand.json", "{nope"); put("brand/ghost/brand.json", JSON.stringify(testBrand("ghost", { character: { enabled: true, id: "boo", name: "Boo" } })));
    const r = run(true);
    expect(r.status).toBe("blocked");
    expect(r.problems.join(" ")).toContain("brand/bad/brand.json is not valid JSON");
    expect(r.problems.join(" ")).toContain("mascot/boo.py");
    expect(existsSync(join(ws, "brand/ghost/identity"))).toBe(false);
  });
  it("stops when a reel's audio in reels/ and in public/ are not the same file", () => {
    oldWorkspace(); put("public/3-first/pip.wav", "DIFFERENT");
    const r = run(true);
    expect(r.status).toBe("blocked");
    expect(r.problems.join(" ")).toContain("reels/acme/3-first/audio/pip.wav and public/3-first/pip.wav differ");
  });
});

describe("moving a workspace", () => {
  beforeEach(oldWorkspace);

  it("puts everything of a brand under its own folder, in the new layout, and verifies it", () => {
    const r = run(true);
    expect(r).toMatchObject({ status: "applied", verified: true, problems: [] });
    expect(read("brand/acme/identity/logo.png")).toBe("LOGO");
    expect(read("brand/acme/mascot/pip-voice.wav")).toBe("WAV"); // the character's voice, not identity/
    expect(read("brand/acme/mascot/pip-voice.txt")).toBe("words");
    expect(read("brand/acme/mascot/pip-voice.json")).toContain("0.9");
    expect(existsSync(join(ws, "brand/acme/identity/voice.wav"))).toBe(false);
    expect(read("brand/acme/mascot/pip.py")).toBe("script"); expect(read("brand/acme/mascot/pip.blend")).toBe("blend");
    expect(read("brand/acme/mascot/pip-expressions.png")).toBe("sheet"); expect(read("brand/acme/mascot/pip-head.json")).toBe("{}");
    expect(read("brand/acme/mascot/movements/idle/f-0001.png")).toBe("FRAME");
    expect(read("brand/acme/mascot/studio/previews/front.png")).toBe("png");
    expect(read("brand/acme/reels/3-first/a.mp4")).toBe("VIDEO");
    expect(read("brand/acme/reels/3-first/audio/pip.wav")).toBe("FINAL");
    expect(read("brand/acme/reels/4-second/audio/pip.wav")).toBe("ONLY-IN-PUBLIC"); // the final audio that only public/ had comes along
    expect(read("brands/acme/reel-questions.md", data)).toBe("## To do\n"); // the question list is hub data
    expect(existsSync(join(ws, "brand/acme/identity/reel-questions.md"))).toBe(false);
    expect(existsSync(join(ws, "brand/acme/identity/voice-sample.md"))).toBe(false); // the guide is in the reel skill
    expect(existsSync(join(ws, "brand/acme/hooks.csv"))).toBe(true); // other files of the brand stay where they are
  });
  it("writes a brand.json that the hub reads, with the voice pointing at the new place", () => {
    run(true);
    const b = readBrand(ws, "acme")!;
    expect(b.name).toBe("Acme");
    expect(b.voice).toMatchObject({ sample: "mascot/pip-voice.wav", sampleText: "mascot/pip-voice.txt" });
    expect(b.character).toMatchObject({ enabled: true, id: "pip" });
  });
  it("keeps a brand without a character simple: identity only, an empty reels folder is not made up", () => {
    run(true);
    expect(read("brand/plain/identity/style.md")).toBe("# plain");
    expect(existsSync(join(ws, "brand/plain/mascot"))).toBe(false);
    expect(readBrand(ws, "plain")?.voice.sample).toBeNull();
  });
  it("puts a brand's own voice in identity/ when it has no character", () => {
    const b = testBrand("solo", { name: "Solo", voice: { engine: "voxcpm2", sample: "voice/voice.wav", sampleText: "voice/voice.txt" } });
    put("brand/solo/brand.json", JSON.stringify(b)); put("brand/solo/voice/voice.wav", "SOLO-WAV"); put("brand/solo/voice/voice.txt", "solo words");
    run(true);
    expect(read("brand/solo/identity/voice.wav")).toBe("SOLO-WAV");
    expect(readBrand(ws, "solo")?.voice).toMatchObject({ sample: "identity/voice.wav", sampleText: "identity/voice.txt" });
  });
  it("rewrites the paths the style guide names, and nothing else in it", () => {
    run(true);
    const md = read("brand/acme/identity/style.md");
    expect(md).toContain("`brand/acme/mascot/pip-voice.wav`");
    expect(md).toContain("`.claude/skills/reel/voice-sample.md`");
    expect(md).toContain("`brand/acme/mascot/pip.py`");
    expect(md).toContain("`brand/acme/mascot/pip.blend`");
    expect(md).toContain("`brand/acme/mascot/movements/<move>/`");
    expect(md).toContain("Logo: `brand/acme/identity/logo.png`");
    expect(md).toContain("`brand/acme/reels/3-first/`");
    expect(md).toContain("`reels/other/1-x/`"); // another brand's folder is not this brand's to rewrite
    expect(md).toContain("**Pip** only");
  });
  it("leaves the old files where they are, and is safe to run again", () => {
    run(true);
    expect(read("brand/acme/brand.json")).toContain("Acme");
    expect(existsSync(join(ws, "reels/acme/3-first/a.mp4"))).toBe(true);
    expect(existsSync(join(ws, "mascot/pip.py"))).toBe(true);
    expect(run(true).status).toBe("already");
  });
  it("copies nothing over a destination that already has different content", () => {
    put("brand/acme/identity/logo.png", "SOMEONE-ELSE"); // identity/ without brand.json: not yet a moved brand
    const r = run(true);
    expect(r.verified).toBe(false);
    expect(r.problems.join(" ")).toContain("logo");
    expect(read("brand/acme/identity/logo.png")).toBe("SOMEONE-ELSE");
  });
});

describe("taking away the old copies", () => {
  let program: string;
  beforeEach(() => {
    oldWorkspace(); run(true);
    program = join(tmp, "program");
    put("sfx/ding.wav", "ding", program); put("brand/_template/brand.json", "{}", program);
  });
  const rel = (list: string[]) => list.map((p) => p.replace(`${ws}/`, "")).sort();
  const GONE = [
    "brand/acme/brand.json", "brand/acme/style.md", "brand/acme/logo.png", "brand/acme/reel-questions.md", "brand/acme/voice-sample.md",
    "brand/acme/pip-voice.wav", "brand/acme/pip-voice.txt", "brand/acme/pip-voice.json", "reels/acme", "characters/acme",
    "mascot/pip.py", "mascot/pip.blend", "mascot/pip-expressions.png", "mascot/work/head.json", "public/mascot", "public/3-first", "public/4-second", "public/a1", "brand/_template",
    "brand/plain/brand.json", "brand/plain/style.md", "brand/plain/voice-sample.md",
  ];

  it("lists them without removing anything unless asked", () => {
    const r = removeOldFiles({ workspace: ws, data, remove: false, programRoot: program });
    expect(r.kept).toEqual([]);
    expect(rel(r.removed)).toEqual([...GONE].sort());
    for (const f of GONE) expect(existsSync(join(ws, f)), f).toBe(true);
  });
  it("removes them, the empty folders they leave, and nothing that is not part of the move", () => {
    const r = removeOldFiles({ workspace: ws, data, remove: true, programRoot: program });
    expect(r.kept).toEqual([]);
    for (const f of GONE) expect(existsSync(join(ws, f)), f).toBe(false);
    for (const d of ["public", "mascot", "reels", "characters"]) expect(existsSync(join(ws, d)), d).toBe(false);
    expect(existsSync(join(ws, "brand/acme/hooks.csv"))).toBe(true); // not part of the move
    expect(existsSync(join(ws, "brand/acme/identity/brand.json"))).toBe(true);
    expect(read("brand/acme/reels/3-first/a.mp4")).toBe("VIDEO");
    expect(read("brand/acme/mascot/movements/idle/f-0001.png")).toBe("FRAME");
    expect(readBrand(ws, "acme")?.name).toBe("Acme");
  });
  it("keeps what has no identical copy, with the reason, and removes the rest", () => {
    writeFileSync(join(ws, "brand/acme/identity/logo.png"), "CHANGED AFTER THE MOVE");
    writeFileSync(join(ws, "public/4-second/pip.wav"), "EDITED IN PUBLIC");
    put("public/loose-note.txt", "mine"); put("public/5-other/x.txt", "mine");
    const r = removeOldFiles({ workspace: ws, data, remove: true, programRoot: program });
    const why = (p: string) => r.kept.find((k) => k.path.endsWith(p))?.why ?? "";
    expect(why("brand/acme/logo.png")).toContain("not identical");
    expect(why("public/4-second")).toContain("not identical");
    expect(existsSync(join(ws, "brand/acme/logo.png"))).toBe(true);
    expect(existsSync(join(ws, "public/4-second/pip.wav"))).toBe(true);
    expect(existsSync(join(ws, "public/loose-note.txt"))).toBe(true); // public/ keeps what is not a leftover
    expect(existsSync(join(ws, "reels/acme"))).toBe(false);
    expect(existsSync(join(ws, "brand/acme/brand.json"))).toBe(false);
  });
  it("keeps the old sounds and template when the program does not have them", () => {
    put("public/a1/odd.wav", "odd");
    const r = removeOldFiles({ workspace: ws, data, remove: true, programRoot: program });
    expect(r.kept.find((k) => k.path.endsWith("public/a1"))?.why).toContain("odd.wav");
    expect(existsSync(join(ws, "public/a1/odd.wav"))).toBe(true);
    const without = removeOldFiles({ workspace: ws, data, remove: false });
    expect(without.removed.some((p) => p.endsWith("brand/_template"))).toBe(false); // no program folder given: the template is not touched
  });
  it("does nothing without the record of a verified move", () => {
    rmSync(join(ws, ".reel-studio"), { recursive: true, force: true });
    const r = removeOldFiles({ workspace: ws, data, remove: true });
    expect(r.removed).toEqual([]);
    expect(existsSync(join(ws, "reels/acme"))).toBe(true);
  });
});

describe("updateStyleGuide", () => {
  const brand = { character: { enabled: true, id: "pip", name: "Pip" } };
  it("returns a guide that names none of the paths unchanged", () => {
    expect(updateStyleGuide("# Nothing here", "acme", brand, { oldWav: null, oldTxt: null, newWav: null, newTxt: null })).toBe("# Nothing here");
  });
  it("does not rewrite what already has the new form twice", () => {
    const once = updateStyleGuide("`mascot/pip.py` and `brand/acme/mascot/pip.py`", "acme", brand, { oldWav: null, oldTxt: null, newWav: null, newTxt: null });
    expect(once).toBe("`brand/acme/mascot/pip.py` and `brand/acme/mascot/pip.py`");
  });
});
