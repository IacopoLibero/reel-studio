import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readBrand, writeBrand } from "../src/brands/registry.js";
import { testBrand } from "./helpers/brand.js";
import { moveVoiceToCharacter } from "../src/brands/voice-move.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "voice-move-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function seed(character: boolean) {
  writeBrand(dir, testBrand("acme", { character: { enabled: character, id: "bun", name: "Bun" }, voice: { engine: "voxcpm2", sample: "identity/voice.wav", sampleText: "identity/voice.txt" } }));
  const id = join(dir, "brands", "acme", "identity");
  writeFileSync(join(id, "voice.wav"), "wav"); writeFileSync(join(id, "voice.txt"), "words"); writeFileSync(join(id, "voice.json"), "{}");
  return id;
}

describe("moveVoiceToCharacter", () => {
  it("moves the sample to mascot/<id>-voice.* and updates brand.json", () => {
    const id = seed(true);
    expect(moveVoiceToCharacter(dir, "acme")).toHaveLength(3);
    const m = join(dir, "brands", "acme", "mascot");
    expect(readFileSync(join(m, "bun-voice.wav"), "utf8")).toBe("wav");
    expect(readFileSync(join(m, "bun-voice.txt"), "utf8")).toBe("words");
    expect(existsSync(join(id, "voice.wav"))).toBe(false);
    const b = readBrand(dir, "acme")!;
    expect(b.voice.sample).toBe("mascot/bun-voice.wav");
    expect(b.voice.sampleText).toBe("mascot/bun-voice.txt");
  });
  it("does nothing for a brand without a character", () => {
    const id = seed(false);
    expect(moveVoiceToCharacter(dir, "acme")).toEqual([]);
    expect(existsSync(join(id, "voice.wav"))).toBe(true);
  });
  it("is a no-op the second time", () => {
    seed(true); moveVoiceToCharacter(dir, "acme");
    expect(moveVoiceToCharacter(dir, "acme")).toEqual([]);
  });
  it("never overwrites an existing target", () => {
    const id = seed(true);
    const m = join(dir, "brands", "acme", "mascot"); mkdirSync(m, { recursive: true });
    writeFileSync(join(m, "bun-voice.wav"), "other");
    expect(moveVoiceToCharacter(dir, "acme")).toEqual([]);
    expect(readFileSync(join(m, "bun-voice.wav"), "utf8")).toBe("other");
    expect(existsSync(join(id, "voice.wav"))).toBe(true);
    expect(readBrand(dir, "acme")!.voice.sample).toBe("identity/voice.wav");
  });
});
