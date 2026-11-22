/** Which VoiceStudio voice engine uses which downloaded model, and which engines can be selected now. */
const ENGINE_OF_REPO: Readonly<Record<string, string>> = {
  "openbmb/VoxCPM2": "voxcpm2",
  "KittenML/kitten-tts-mini-0.8": "kittentts",
  "FunAudioLLM/Fun-CosyVoice3-0.5B-2512": "cosyvoice",
  "lj1995/GPT-SoVITS": "gpt-sovits",
  "k2-fsa/OmniVoice": "omnivoice",
};

export const engineOfRepo = (repoId: string): string | null => ENGINE_OF_REPO[repoId] ?? null;

export interface EngineRow { id: string; available: boolean; reason: string }
export interface EngineList { active: string; engines: EngineRow[] }

/** The answer of VoiceStudio's /engines/tts: the engine in use, and for each engine whether it can be used now. */
export function summarizeEngines(raw: unknown): EngineList {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const backends = Array.isArray(r.backends) ? r.backends : [];
  return {
    active: typeof r.active === "string" ? r.active : "",
    engines: backends.filter((b): b is Record<string, unknown> => !!b && typeof b === "object" && typeof (b as Record<string, unknown>).id === "string")
      .map((b) => ({ id: String(b.id), available: b.available === true, reason: typeof b.reason === "string" ? b.reason : "" })),
  };
}
