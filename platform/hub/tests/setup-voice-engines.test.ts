import { describe, expect, it } from "vitest";
import { engineOfRepo, summarizeEngines } from "../src/setup/voice-engines.js";

describe("engineOfRepo", () => {
  it("maps a model to the VoiceStudio engine that uses it", () => {
    expect(engineOfRepo("openbmb/VoxCPM2")).toBe("voxcpm2");
    expect(engineOfRepo("KittenML/kitten-tts-mini-0.8")).toBe("kittentts");
    expect(engineOfRepo("FunAudioLLM/Fun-CosyVoice3-0.5B-2512")).toBe("cosyvoice");
    expect(engineOfRepo("lj1995/GPT-SoVITS")).toBe("gpt-sovits");
    expect(engineOfRepo("k2-fsa/OmniVoice")).toBe("omnivoice");
  });
  it("is null for a model it does not know", () => {
    expect(engineOfRepo("x/y")).toBeNull();
  });
});

describe("summarizeEngines", () => {
  it("gives the active engine and which engines can be selected now", () => {
    const r = summarizeEngines({ active: "voxcpm2", backends: [
      { id: "voxcpm2", available: true, display_name: "V" }, { id: "gpt-sovits", available: false, reason: "not ready" }, { id: "off" },
    ] });
    expect(r.active).toBe("voxcpm2");
    expect(r.engines).toEqual([
      { id: "voxcpm2", available: true, reason: "" }, { id: "gpt-sovits", available: false, reason: "not ready" }, { id: "off", available: false, reason: "" },
    ]);
  });
  it("tolerates an odd answer", () => {
    expect(summarizeEngines(null)).toEqual({ active: "", engines: [] });
  });
});
