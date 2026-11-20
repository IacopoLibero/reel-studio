import { EMPTY_CHARACTER_FIELDS, type CharacterFields } from "../../src/shared/character-prompt";
import type { CreateRequest, VoiceCandidate } from "../api";

/** The choices around the brand itself: logo, voice, character and the daily loop. Shared by the form, the interview review and the import. */
export interface ExtrasState {
  logo: { id: string; name: string; url: string } | null;
  /** "design": the voices the hub made for the brand. The picked one sits in `wav` and `text`, so it is sent like an uploaded sample. */
  voice: { mode: "later" | "reuse" | "upload" | "design"; from: string; wav: { id: string; name: string } | null; text: string; candidates: VoiceCandidate[];
    /** `instruct` of every voice heard so far in this form (newest last), so a new round proposes others. */
    heard: string[] };
  character: { mode: "none" | "create" | "import"; name: string; id: string; fields: CharacterFields; sheet: { id: string; name: string; url: string } | null };
  daily: boolean;
}

export const emptyExtras = (): ExtrasState => ({
  logo: null,
  voice: { mode: "later", from: "", wav: null, text: "", candidates: [], heard: [] },
  character: { mode: "none", name: "", id: "", fields: { ...EMPTY_CHARACTER_FIELDS }, sheet: null },
  daily: false,
});

export interface ExtrasScope { hideLogo?: boolean; hideVoice?: boolean }

export function extrasProblems(e: ExtrasState, s: ExtrasScope = {}): Record<string, string> {
  const p: Record<string, string> = {};
  if (!s.hideVoice) {
    if (e.voice.mode === "reuse" && !e.voice.from) p.voice = "Choose the brand whose voice you want to reuse.";
    if (e.voice.mode === "upload" && !e.voice.wav) p.voice = "Upload the WAV sample.";
    if (e.voice.mode === "design" && !e.voice.wav) p.voice = "Make some voices, listen, and pick one.";
    if ((e.voice.mode === "upload" || e.voice.mode === "design") && e.voice.wav && e.voice.text.trim().length < 3) p.voiceText = "Type the words spoken in the sample.";
  }
  if (e.character.mode === "create" && !e.character.name.trim()) p.character = "Give the character a name.";
  if (e.character.mode === "import" && !e.character.id) p.character = "Choose which character to use.";
  return p;
}

/** The part of the create request that comes from the extras. */
export function extrasToRequest(e: ExtrasState, s: ExtrasScope = {}): Pick<CreateRequest, "logoUpload" | "voice" | "character" | "dailyLoop"> {
  const c = e.character;
  const voice: CreateRequest["voice"] = s.hideVoice || e.voice.mode === "later" ? { mode: "later" } : e.voice.mode === "reuse" ? { mode: "reuse", from: e.voice.from } : { mode: "upload", wavUpload: e.voice.wav?.id ?? "", text: e.voice.text.trim() };
  const character: CreateRequest["character"] = c.mode === "none" ? { mode: "none" }
    : c.mode === "import" ? { mode: "import", id: c.id, name: c.name.trim() || c.id, ...(c.sheet ? { sheetUpload: c.sheet.id } : {}) }
    : { mode: "create", name: c.name.trim(), fields: c.fields, ...(c.sheet ? { sheetUpload: c.sheet.id } : {}) };
  return { ...(!s.hideLogo && e.logo ? { logoUpload: e.logo.id } : {}), voice, character, dailyLoop: e.daily };
}

/** Reads a File as base64 (for the folder import). */
export function toBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Could not read the file."));
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.readAsDataURL(file);
  });
}
