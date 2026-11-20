import { describe, expect, it } from "vitest";
import { emptyExtras, extrasProblems, extrasToRequest, type ExtrasState } from "../web/creator/extras";

const withVoice = (v: Partial<ExtrasState["voice"]>): ExtrasState => ({ ...emptyExtras(), voice: { ...emptyExtras().voice, ...v } });
const withChar = (c: Partial<ExtrasState["character"]>): ExtrasState => ({ ...emptyExtras(), character: { ...emptyExtras().character, ...c } });

describe("extras: problems", () => {
  it("starts clean: no voice, no character, daily off", () => {
    expect(extrasProblems(emptyExtras())).toEqual({});
    expect(extrasToRequest(emptyExtras())).toEqual({ voice: { mode: "later" }, character: { mode: "none" }, dailyLoop: false });
  });
  it("asks for what each voice choice needs", () => {
    expect(extrasProblems(withVoice({ mode: "reuse" })).voice).toContain("Choose");
    expect(extrasProblems(withVoice({ mode: "upload" })).voice).toContain("WAV");
    expect(extrasProblems(withVoice({ mode: "upload", wav: { id: "a", name: "v.wav" }, text: "hi" })).voiceText).toContain("words");
    expect(extrasProblems(withVoice({ mode: "upload" }), { hideVoice: true })).toEqual({});
  });
  it("asks for a character name or id", () => {
    expect(extrasProblems(withChar({ mode: "create" })).character).toContain("name");
    expect(extrasProblems(withChar({ mode: "import" })).character).toContain("Choose");
    expect(extrasProblems(withChar({ mode: "create", name: "Bun" }))).toEqual({});
  });
});

describe("extras: the request", () => {
  it("maps each choice to what the hub expects", () => {
    const e: ExtrasState = {
      logo: { id: "l".repeat(32), name: "logo.png", url: "blob:x" },
      voice: { mode: "upload", from: "", wav: { id: "w".repeat(32), name: "v.wav" }, text: "  Hello there  " },
      character: { mode: "create", name: " Bun ", id: "", fields: { what: "a bun", personality: "", extra: "" }, sheet: { id: "s".repeat(32), name: "s.png", url: "blob:y" } },
      daily: true,
    };
    expect(extrasToRequest(e)).toEqual({
      logoUpload: "l".repeat(32), voice: { mode: "upload", wavUpload: "w".repeat(32), text: "Hello there" },
      character: { mode: "create", name: "Bun", fields: { what: "a bun", personality: "", extra: "" }, sheetUpload: "s".repeat(32) }, dailyLoop: true,
    });
    expect(extrasToRequest(e, { hideLogo: true, hideVoice: true })).toMatchObject({ voice: { mode: "later" } });
    expect(extrasToRequest(e, { hideLogo: true })).not.toHaveProperty("logoUpload");
    expect(extrasToRequest(withVoice({ mode: "reuse", from: "other" })).voice).toEqual({ mode: "reuse", from: "other" });
    expect(extrasToRequest(withChar({ mode: "import", id: "bun" })).character).toEqual({ mode: "import", id: "bun", name: "bun" });
  });
});

describe("the suggested voice", () => {
  const cand = { id: "a".repeat(32), label: "Warm and calm", instruct: "female, warm", text: "Welcome to our little bakery, fresh every morning.", seconds: 4 };
  const designed = (over: Partial<ExtrasState["voice"]> = {}): ExtrasState => ({ ...emptyExtras(), voice: { ...emptyExtras().voice, mode: "design", candidates: [cand], ...over } });
  it("asks for a pick before creating", () => {
    expect(extrasProblems(designed()).voice).toMatch(/pick one/);
    expect(extrasProblems(designed({ wav: { id: cand.id, name: cand.label }, text: cand.text }))).toEqual({});
  });
  it("is sent as the picked voice upload with its words", () => {
    const e = designed({ wav: { id: cand.id, name: cand.label }, text: `  ${cand.text} ` });
    expect(extrasToRequest(e).voice).toEqual({ mode: "upload", wavUpload: cand.id, text: cand.text });
  });
  it("sends nothing in the import, which has its own voice files", () => {
    expect(extrasToRequest(designed({ wav: { id: cand.id, name: "x" }, text: cand.text }), { hideVoice: true }).voice).toEqual({ mode: "later" });
  });
});
