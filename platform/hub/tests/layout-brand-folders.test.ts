import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findOldBrands, findWorkspaceBrands, migrateBrandFolders, moveBrandsIntoData, relativeStyleGuide, removeOldFiles, updateStyleGuide } from "../src/layout/brand-folders.js";
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
    expect(findOldBrands(ws, data)).toEqual(["acme", "plain"]);
    put("brand/done/identity/brand.json", "{}"); put("brand/done/brand.json", "{}"); // already one-folder-per-brand in the workspace
    put("brands/moved/identity/brand.json", "{}", data); put("brand/moved/brand.json", "{}"); // already moved into the data folder
    expect(findOldBrands(ws, data)).toEqual(["acme", "plain"]);
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
    expect(acme.copies.map((c) => c.what).sort()).toEqual(["character model", "character script", "character studio", "reference sheet", "final audio of 4-second", "head shape", "logo", "question list", "reels", "rendered moves", "voice sample", "voice settings", "words of the voice sample"].sort());
    expect(existsSync(join(data, "brands/acme/identity"))).toBe(false);
    expect(existsSync(join(data, "brands"))).toBe(false);
    expect(r.leftovers.some((p) => p.endsWith("brand/acme/brand.json"))).toBe(true);
  });
  it("stops on a brand.json that is not valid and on a character script that is missing", () => {
    put("brand/bad/brand.json", "{nope"); put("brand/ghost/brand.json", JSON.stringify(testBrand("ghost", { character: { enabled: true, id: "boo", name: "Boo" } })));
    const r = run(true);
    expect(r.status).toBe("blocked");
    expect(r.problems.join(" ")).toContain("brand/bad/brand.json is not valid JSON");
    expect(r.problems.join(" ")).toContain("mascot/boo.py");
    expect(existsSync(join(data, "brands/ghost/identity"))).toBe(false);
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
    expect(r.problems).toEqual([]);
    expect(r).toMatchObject({ status: "applied", verified: true, problems: [] });
    expect(read("brands/acme/identity/logo.png", data)).toBe("LOGO");
    expect(read("brands/acme/mascot/pip-voice.wav", data)).toBe("WAV"); // the character's voice, not identity/
    expect(read("brands/acme/mascot/pip-voice.txt", data)).toBe("words");
    expect(read("brands/acme/mascot/pip-voice.json", data)).toContain("0.9");
    expect(existsSync(join(data, "brands/acme/identity/voice.wav"))).toBe(false);
    expect(read("brands/acme/mascot/pip.py", data)).toBe("script"); expect(read("brands/acme/mascot/pip.blend", data)).toBe("blend");
    expect(read("brands/acme/mascot/studio/reference-sheet.png", data)).toBe("sheet"); // the sheet the character was drawn from: nothing reads it while reels are made
    expect(existsSync(join(data, "brands/acme/mascot/pip-expressions.png"))).toBe(false);
    expect(read("brands/acme/mascot/pip-head.json", data)).toBe("{}");
    expect(read("brands/acme/mascot/movements/idle/f-0001.png", data)).toBe("FRAME");
    expect(read("brands/acme/mascot/studio/previews/front.png", data)).toBe("png");
    expect(read("brands/acme/reels/3-first/a.mp4", data)).toBe("VIDEO");
    expect(read("brands/acme/reels/3-first/audio/pip.wav", data)).toBe("FINAL");
    expect(read("brands/acme/reels/4-second/audio/pip.wav", data)).toBe("ONLY-IN-PUBLIC"); // the final audio that only public/ had comes along
    expect(read("brands/acme/reel-questions.md", data)).toBe("## To do\n"); // the question list is hub data
    expect(existsSync(join(data, "brands/acme/identity/reel-questions.md"))).toBe(false);
    expect(existsSync(join(data, "brands/acme/identity/voice-sample.md"))).toBe(false); // the guide is in the reel skill
    expect(existsSync(join(ws, "brand/acme/hooks.csv"))).toBe(true); // other files of the brand stay where they are
  });
  it("writes a brand.json that the hub reads, with the voice pointing at the new place", () => {
    run(true);
    const b = readBrand(data, "acme")!;
    expect(b.name).toBe("Acme");
    expect(b.voice).toMatchObject({ sample: "mascot/pip-voice.wav", sampleText: "mascot/pip-voice.txt" });
    expect(b.character).toMatchObject({ enabled: true, id: "pip" });
  });
  it("keeps a brand without a character simple: identity only, an empty reels folder is not made up", () => {
    run(true);
    expect(read("brands/plain/identity/style.md", data)).toBe("# plain");
    expect(existsSync(join(data, "brands/plain/mascot"))).toBe(false);
    expect(readBrand(data, "plain")?.voice.sample).toBeNull();
  });
  it("puts a brand's own voice in identity/ when it has no character", () => {
    const b = testBrand("solo", { name: "Solo", voice: { engine: "voxcpm2", sample: "voice/voice.wav", sampleText: "voice/voice.txt" } });
    put("brand/solo/brand.json", JSON.stringify(b)); put("brand/solo/voice/voice.wav", "SOLO-WAV"); put("brand/solo/voice/voice.txt", "solo words");
    run(true);
    expect(read("brands/solo/identity/voice.wav", data)).toBe("SOLO-WAV");
    expect(readBrand(data, "solo")?.voice).toMatchObject({ sample: "identity/voice.wav", sampleText: "identity/voice.txt" });
  });
  it("rewrites the paths the style guide names, and nothing else in it", () => {
    run(true);
    const md = read("brands/acme/identity/style.md", data);
    expect(md).toContain("`mascot/pip-voice.wav`"); // paths are relative to the brand folder
    expect(md).toContain("`.claude/skills/reel/voice-sample.md`");
    expect(md).toContain("`mascot/pip.py`");
    expect(md).toContain("`mascot/pip.blend`");
    expect(md).toContain("`mascot/movements/<move>/`");
    expect(md).toContain("Logo: `identity/logo.png`");
    expect(md).toContain("`reels/3-first/`");
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
    put("brands/acme/identity/logo.png", "SOMEONE-ELSE", data); // identity/ without brand.json: not yet a moved brand
    const r = run(true);
    expect(r.verified).toBe(false);
    expect(r.problems.join(" ")).toContain("logo");
    expect(r.problems.join(" ")).toContain("delete it and run this again");
    expect(read("brands/acme/identity/logo.png", data)).toBe("SOMEONE-ELSE");
    // brand.json is written last and only after the copies were checked: acme is still an old brand, so the next run tries it again, and "plain" moved
    expect(existsSync(join(data, "brands/acme/identity/brand.json"))).toBe(false);
    expect(findOldBrands(ws, data)).toEqual(["acme"]);
    expect(existsSync(join(data, "brands/plain/identity/brand.json"))).toBe(true);
    rmSync(join(data, "brands/acme/identity/logo.png"));
    expect(run(true)).toMatchObject({ status: "applied", verified: true });
    expect(read("brands/acme/identity/logo.png", data)).toBe("LOGO");
  });
  it("keeps the brands of an earlier run in the record when a later run moves more", () => {
    put("brand/late/brand.json", JSON.stringify(testBrand("late", { name: "Late" }))); put("brand/late/logo.png", "LATE-LOGO"); put("brands/late/identity/logo.png", "OTHER", data);
    expect(run(true).verified).toBe(false); // late fails, acme and plain move
    expect(JSON.parse(read(".reel-studio/brand-folders.json")).brands).toEqual(["acme", "plain"]);
    rmSync(join(data, "brands/late/identity/logo.png"));
    run(true);
    expect(JSON.parse(read(".reel-studio/brand-folders.json")).brands).toEqual(["acme", "late", "plain"]);
  });
  it("refuses a voice path that leaves the brand folder", () => {
    put("brand/sneaky/brand.json", JSON.stringify(testBrand("sneaky", { voice: { engine: "voxcpm2", sample: "../../secret.wav", sampleText: "voice/s.txt" } })));
    const r = run(true);
    expect(r.status).toBe("blocked");
    expect(r.problems.join(" ")).toContain("must stay inside the brand folder");
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
    "brand/acme/brand.json", "brand/acme/style.md", "brand/acme/logo.png", "brand/acme/reel-questions.md",
    "brand/acme/pip-voice.wav", "brand/acme/pip-voice.txt", "brand/acme/pip-voice.json", "reels/acme", "characters/acme",
    "mascot/pip.py", "mascot/pip.blend", "mascot/pip-expressions.png", "mascot/work/head.json", "public/mascot", "public/3-first", "public/4-second", "public/a1", "brand/_template",
    "brand/plain/brand.json", "brand/plain/style.md",
  ];
  const NOTES = ["brand/acme/voice-sample.md", "brand/plain/voice-sample.md"]; // may hold the owner's own notes: always left

  it("lists them without removing anything unless asked", () => {
    const r = removeOldFiles({ workspace: ws, data, remove: false, programRoot: program });
    expect(rel(r.kept.map((k) => k.path))).toEqual([...NOTES].sort());
    expect(r.kept[0]?.why).toContain("may hold your own notes");
    expect(rel(r.removed)).toEqual([...GONE].sort());
    for (const f of GONE) expect(existsSync(join(ws, f)), f).toBe(true);
  });
  it("removes them, the empty folders they leave, and nothing that is not part of the move", () => {
    const r = removeOldFiles({ workspace: ws, data, remove: true, programRoot: program });
    expect(rel(r.kept.map((k) => k.path))).toEqual([...NOTES].sort());
    for (const f of GONE) expect(existsSync(join(ws, f)), f).toBe(false);
    for (const f of NOTES) expect(existsSync(join(ws, f)), f).toBe(true);
    for (const d of ["public", "mascot", "reels", "characters"]) expect(existsSync(join(ws, d)), d).toBe(false);
    expect(existsSync(join(ws, "brand/acme/hooks.csv"))).toBe(true); // not part of the move
    expect(existsSync(join(data, "brands/acme/identity/brand.json"))).toBe(true);
    expect(read("brands/acme/reels/3-first/a.mp4", data)).toBe("VIDEO");
    expect(read("brands/acme/mascot/movements/idle/f-0001.png", data)).toBe("FRAME");
    expect(readBrand(data, "acme")?.name).toBe("Acme");
  });
  it("keeps what has no identical copy, with the reason, and removes the rest", () => {
    writeFileSync(join(data, "brands/acme/identity/logo.png"), "CHANGED AFTER THE MOVE");
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
  it("never removes the voice folder as a whole: other takes in it stay, and the folder goes only when nothing is left", () => {
    const b = testBrand("solo", { name: "Solo", voice: { engine: "voxcpm2", sample: "voice/voice.wav", sampleText: "voice/voice.txt" } });
    put("brand/solo/brand.json", JSON.stringify(b)); put("brand/solo/voice/voice.wav", "W"); put("brand/solo/voice/voice.txt", "t"); put("brand/solo/voice/other-take.wav", "MY OTHER TAKE");
    run(true);
    removeOldFiles({ workspace: ws, data, remove: true, programRoot: program });
    expect(read("brand/solo/voice/other-take.wav")).toBe("MY OTHER TAKE");
    expect(existsSync(join(ws, "brand/solo/voice/voice.wav"))).toBe(false);
    expect(read("brands/solo/identity/voice.wav", data)).toBe("W");
    rmSync(join(ws, "brand/solo/voice/other-take.wav"));
    const again = removeOldFiles({ workspace: ws, data, remove: true, programRoot: program });
    expect(existsSync(join(ws, "brand/solo/voice"))).toBe(false);
    expect(again.kept.some((k) => k.path.endsWith("brand/solo/voice"))).toBe(false);
  });
  it("keeps the voice sample and its folder when the copy is not identical", () => {
    const b = testBrand("solo", { name: "Solo", voice: { engine: "voxcpm2", sample: "voice/voice.wav", sampleText: "voice/voice.txt" } });
    put("brand/solo/brand.json", JSON.stringify(b)); put("brand/solo/voice/voice.wav", "W"); put("brand/solo/voice/voice.txt", "t");
    run(true);
    writeFileSync(join(data, "brands/solo/identity/voice.wav"), "CHANGED");
    removeOldFiles({ workspace: ws, data, remove: true, programRoot: program });
    expect(read("brand/solo/voice/voice.wav")).toBe("W");
    expect(existsSync(join(ws, "brand/solo/voice"))).toBe(true);
  });
  it("keeps an old brand.json or style.md that was edited after the move, and one whose new file was edited", () => {
    writeFileSync(join(ws, "brand/acme/style.md"), `${STYLE}\n- a line the owner added to the OLD file after the move`);
    writeFileSync(join(data, "brands/plain/identity/style.md"), "# plain, edited in the new place");
    const r = removeOldFiles({ workspace: ws, data, remove: true, programRoot: program });
    expect(r.kept.find((k) => k.path.endsWith("brand/acme/style.md"))?.why).toContain("changed after the move");
    expect(r.kept.find((k) => k.path.endsWith("brand/plain/style.md"))?.why).toContain("changed after the move");
    expect(read("brand/acme/style.md")).toContain("a line the owner added");
    expect(existsSync(join(ws, "brand/acme/brand.json"))).toBe(false); // unchanged: removed
  });
  it("keeps a folder with a symbolic link inside, and never touches the link's target", () => {
    const outside = join(tmp, "outside"); mkdirSync(outside); writeFileSync(join(outside, "precious.txt"), "precious");
    symlinkSync(outside, join(ws, "characters/acme/linked"));
    const r = removeOldFiles({ workspace: ws, data, remove: true, programRoot: program });
    expect(r.kept.find((k) => k.path.endsWith("characters/acme"))?.why).toContain("symbolic link");
    expect(existsSync(join(ws, "characters/acme/state.json"))).toBe(true);
    expect(readFileSync(join(outside, "precious.txt"), "utf8")).toBe("precious");
  });
  it("does not remove a public/ or reels/ folder that is only a link, or holds only links", () => {
    removeOldFiles({ workspace: ws, data, remove: true, programRoot: program }); // leaves public/ empty and removes it
    const outside = join(tmp, "outside2"); mkdirSync(outside); writeFileSync(join(outside, "keep.txt"), "keep");
    mkdirSync(join(ws, "public")); symlinkSync(outside, join(ws, "public/linked"));
    removeOldFiles({ workspace: ws, data, remove: true, programRoot: program });
    expect(existsSync(join(ws, "public/linked"))).toBe(true);
    expect(readFileSync(join(outside, "keep.txt"), "utf8")).toBe("keep");
  });
  it("keeps the old sounds when they hold a sub-folder, without failing", () => {
    put("public/a1/sub/x.wav", "x");
    const r = removeOldFiles({ workspace: ws, data, remove: true, programRoot: program });
    expect(r.kept.find((k) => k.path.endsWith("public/a1"))).toBeTruthy();
    expect(existsSync(join(ws, "public/a1/sub/x.wav"))).toBe(true);
  });
  it("leaves the template and the sounds alone when the program folder is the workspace itself", () => {
    const r = removeOldFiles({ workspace: ws, data, remove: true, programRoot: ws });
    expect(existsSync(join(ws, "brand/_template/brand.json"))).toBe(true);
    expect(r.removed.some((p) => p.endsWith("brand/_template"))).toBe(false);
  });
  it("refuses to work from a record it cannot read, and does not throw", () => {
    writeFileSync(join(ws, ".reel-studio/brand-folders.json"), "{ not json");
    expect(removeOldFiles({ workspace: ws, data, remove: true }).removed).toEqual([]);
    writeFileSync(join(ws, ".reel-studio/brand-folders.json"), JSON.stringify({ brands: ["../../etc"] }));
    expect(removeOldFiles({ workspace: ws, data, remove: true }).removed).toEqual([]);
    expect(existsSync(join(ws, "reels/acme"))).toBe(true);
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
  it("leaves paths that are already relative to the brand folder as they are", () => {
    const md = "`mascot/pip.py` and `identity/logo.png`";
    expect(updateStyleGuide(md, "acme", brand, { oldWav: null, oldTxt: null, newWav: null, newTxt: null })).toBe(md);
  });
});

describe("moving brand folders from the workspace into the data folder", () => {
  /** A workspace already in the one-folder-per-brand layout: workspace/brand/<slug>/{identity,mascot,reels}. */
  function v2(): void {
    const acme = testBrand("acme", { name: "Acme", character: { enabled: true, id: "pip", name: "Pip" }, voice: { engine: "voxcpm2", sample: "mascot/pip-voice.wav", sampleText: "mascot/pip-voice.txt" } });
    put("brand/acme/identity/brand.json", JSON.stringify(acme)); put("brand/acme/identity/logo.png", "LOGO");
    put("brand/acme/identity/style.md", "Voice: `brand/acme/mascot/pip-voice.wav`. Logo: `brand/acme/identity/logo.png`. Other: `brand/beta/identity/logo.png`.");
    put("brand/acme/mascot/pip.py", "script"); put("brand/acme/mascot/pip-voice.wav", "WAV"); put("brand/acme/mascot/movements/idle/f-0001.png", "FRAME");
    put("brand/acme/reels/3-first/a.mp4", "VIDEO"); put("brand/acme/reels/3-first/audio/pip.wav", "FINAL");
    put("brands/acme/scheduled.json", "{}", data); put("brands/acme/reel-questions.md", "## To do\n", data); // the hub data that was already in the data folder
    put("brand/plain/identity/brand.json", JSON.stringify(testBrand("plain", { name: "Plain" }))); put("brand/plain/identity/style.md", "# plain");
    put("brand/plain/hooks.csv", "a,b"); // not part of the move
  }
  const into = (apply: boolean) => moveBrandsIntoData({ workspace: ws, data, apply });

  it("finds the brand folders that are still in the workspace", () => {
    v2();
    expect(findWorkspaceBrands(ws)).toEqual(["acme", "plain"]);
    expect(into(true).status).toBe("applied");
    expect(findWorkspaceBrands(ws)).toEqual([]); // plain keeps its hooks.csv, but no identity, mascot or reels folder is left to move
  });
  it("shows the plan and changes nothing", () => {
    v2();
    const r = into(false);
    expect(r.status).toBe("planned");
    expect(r.brands.find((b) => b.slug === "acme")).toMatchObject({ parts: ["mascot", "reels", "identity"], files: 8 });
    expect(r.brands.find((b) => b.slug === "plain")?.leftovers).toEqual(["hooks.csv"]);
    expect(existsSync(join(ws, "brand/acme/identity/brand.json"))).toBe(true);
    expect(existsSync(join(data, "brands/acme/identity"))).toBe(false);
  });
  it("renames each part into the brand's folder in the data folder, next to the hub data already there", () => {
    v2();
    const r = into(true);
    expect(r).toMatchObject({ status: "applied", verified: true, problems: [] });
    expect(read("brands/acme/identity/logo.png", data)).toBe("LOGO");
    expect(read("brands/acme/mascot/movements/idle/f-0001.png", data)).toBe("FRAME");
    expect(read("brands/acme/reels/3-first/audio/pip.wav", data)).toBe("FINAL");
    expect(read("brands/acme/scheduled.json", data)).toBe("{}"); // untouched
    expect(read("brands/acme/reel-questions.md", data)).toBe("## To do\n");
    expect(existsSync(join(ws, "brand/acme"))).toBe(false); // nothing is left behind: it was a move, not a copy
    expect(readBrand(data, "acme")?.name).toBe("Acme");
  });
  it("makes the paths in the style guide relative to the brand folder, for this brand only", () => {
    v2(); into(true);
    expect(read("brands/acme/identity/style.md", data)).toBe("Voice: `mascot/pip-voice.wav`. Logo: `identity/logo.png`. Other: `brand/beta/identity/logo.png`.");
    expect(relativeStyleGuide("`brand/a/x` `brand/b/x`", "a")).toBe("`x` `brand/b/x`");
  });
  it("leaves the other files of a brand folder where they are, and removes the folder only when it is empty", () => {
    v2(); into(true);
    expect(read("brand/plain/hooks.csv")).toBe("a,b");
    expect(existsSync(join(ws, "brand/plain/identity"))).toBe(false);
    expect(existsSync(join(ws, "brand/acme"))).toBe(false);
  });
  it("refuses a part whose destination already has files, and moves nothing at all", () => {
    v2(); put("brands/acme/reels/9-old/a.mp4", "OTHER", data);
    const r = into(true);
    expect(r.status).toBe("blocked");
    expect(r.problems.join(" ")).toContain("already has files");
    expect(existsSync(join(ws, "brand/acme/identity/brand.json"))).toBe(true);
    expect(existsSync(join(ws, "brand/plain/identity/brand.json"))).toBe(true);
  });
  it("refuses a brand folder with a symbolic link inside", () => {
    v2(); const outside = join(tmp, "outside"); mkdirSync(outside); symlinkSync(outside, join(ws, "brand/acme/reels/linked"));
    expect(into(true).problems.join(" ")).toContain("symbolic link");
    expect(existsSync(join(ws, "brand/acme/identity/brand.json"))).toBe(true);
  });
  it("moves identity last, so an interrupted move leaves a brand the next run still finds, and a second run is harmless", () => {
    v2(); into(true);
    expect(into(true).status).toBe("nothing");
    put("brand/acme/mascot/extra.txt", "x"); // a part came back (or was left): it moves on its own
    expect(findWorkspaceBrands(ws)).toContain("acme");
  });
  it("says nothing to move when the workspace has no brand folders", () => {
    expect(into(true)).toMatchObject({ status: "nothing", verified: true });
  });
});
