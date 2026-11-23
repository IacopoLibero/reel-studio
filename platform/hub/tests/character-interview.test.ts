import { describe, expect, it } from "vitest";
import { buildCharacterInterviewPrompt, characterTurn, characterTurnRequestSchema, parseCharacterTurn } from "../src/creator/character-interview.js";

const brand = characterTurnRequestSchema.parse({
  messages: [],
  brand: { name: "Acme Bakery", about: "Fresh bread", audience: "Families", tone: "Warm", language: "en", colors: { background: "#f5f0e8", text: "#1a1a1a", accent: "#d94a3d", secondary: "#854dff" },
    fonts: { headline: "Oswald", body: "Inter" }, styleMd: "## Voice and tone\n- Warm and playful", earlier: [{ role: "user", text: "We bake sourdough" }, { role: "assistant", text: "Nice, who is it for?" }] },
}).brand;

describe("the character conversation prompt", () => {
  const p = buildCharacterInterviewPrompt([], brand);
  it("carries everything decided about the brand", () => {
    for (const x of ["Acme Bakery", "Fresh bread", "Families", "Warm", "#d94a3d", "Oswald", "Warm and playful", "We bake sourdough", "never ask for it again"]) expect(p).toContain(x);
  });
  it("asks about the look, the personality and what to avoid", () => { expect(p).toMatch(/face/); expect(p).toMatch(/personality/); expect(p).toMatch(/what to avoid/); });
  it("starts the conversation or continues it", () => {
    expect(p).toContain("There is no conversation yet");
    expect(buildCharacterInterviewPrompt([{ role: "user", text: "a loaf" }], brand)).toContain("Person: a loaf");
  });
  it("works for a brand with nothing typed yet", () => { expect(buildCharacterInterviewPrompt([], characterTurnRequestSchema.parse({}).brand)).toContain("(nothing yet)"); });
});

describe("the answer", () => {
  it("reads the fields", () => {
    const r = parseCharacterTurn('{"say":"Next?","character":{"name":"Bun","what":"a round loaf","personality":"kind"},"done":false}');
    expect(r).toMatchObject({ ok: true, turn: { character: { name: "Bun", what: "a round loaf", personality: "kind", extra: "" }, done: false } });
  });
  it("retries once when the first answer is not JSON, then gives up", async () => {
    const answers = ["nope", '{"say":"Hi","character":{"name":"Bun"},"done":true}'];
    const t = await characterTurn({ messages: [], brand }, async () => answers.shift() ?? "");
    expect(t).toMatchObject({ say: "Hi", done: true });
    await expect(characterTurn({ messages: [], brand }, async () => "nope")).rejects.toThrow(/expected format/);
  });
});
