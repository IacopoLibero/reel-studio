import { useState } from "react";
import { api, type CreatorOptions } from "../api";
import { Row } from "../components/SettingsParts";
import type { PromptColors } from "../../src/shared/character-prompt";
import { Card } from "./fields";
import { CharacterPromptBuilder } from "./CharacterPromptBuilder";
import type { ExtrasScope, ExtrasState } from "./extras";
import { VoiceDesigner, type VoiceBrand } from "./VoiceDesigner";

interface Props {
  value: ExtrasState;
  onChange: (v: ExtrasState) => void;
  options: CreatorOptions;
  brandName: string;
  colors: PromptColors;
  problems: Readonly<Record<string, string>>;
  scope?: ExtrasScope;
  /** What the voice step tells the assistant about the brand typed so far. */
  voiceBrand?: VoiceBrand;
}

/** An upload field: sends the file to the hub at once and keeps the id. */
function useUpload(kind: "logo" | "voice" | "sheet") {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async (file: File | undefined): Promise<{ id: string; name: string; url: string } | null> => {
    if (!file) return null;
    setBusy(true); setError(null);
    try { const u = await api.upload(kind, file); return { id: u.id, name: file.name, url: kind === "voice" ? "" : URL.createObjectURL(file) }; } catch (e) { setError((e as Error).message); return null; } finally { setBusy(false); }
  };
  return { send, error, busy };
}

export function Extras({ value: v, onChange, options, brandName, colors, problems, scope = {}, voiceBrand }: Props) {
  const logo = useUpload("logo"), wav = useUpload("voice"), sheet = useUpload("sheet");
  const set = (patch: Partial<ExtrasState>) => onChange({ ...v, ...patch });
  return (
    <>
      {!scope.hideLogo && (
        <Card title="Logo" intro="Shown on the last card of every reel. PNG or SVG, up to 1 MB. You can add it later too.">
          <Row label="Logo file" htmlFor="x-logo" help="A transparent PNG works best." {...(logo.error ? { problem: logo.error } : {})}>
            <input id="x-logo" type="file" accept="image/png,image/svg+xml,.png,.svg" onChange={(e) => { const f = e.target.files?.[0]; void logo.send(f).then((u) => { if (u || !f) set({ logo: u }); }); }} />
            {logo.busy && <p className="muted">Uploading</p>}
            {v.logo && <div className="logo-preview" style={{ background: colors.background }}><img alt="Your logo" src={v.logo.url} /><span className="muted">{v.logo.name}</span></div>}
          </Row>
        </Card>
      )}

      {!scope.hideVoice && (
        <Card title="Voice" intro="The voice that reads the reels. VoiceStudio clones it from a short sample with its text: bring one, or let the assistant suggest voices and pick the one you like.">
          <Row label="Voice" {...(problems.voice ? { problem: problems.voice } : {})}>
            <div className="radios" role="radiogroup" aria-label="Voice">
              {([["later", "Decide later"], ["design", "Suggest voices for me"], ["reuse", "Reuse another brand's voice"], ["upload", "Upload a sample"]] as const).map(([m, label]) => (
                <label key={m} className="radio"><input type="radio" name="voice" checked={v.voice.mode === m} disabled={m === "reuse" && options.voices.length === 0} onChange={() => set({ voice: { ...v.voice, mode: m } })} /> {label}{m === "reuse" && options.voices.length === 0 ? " (no other brand has a voice sample yet)" : ""}</label>
              ))}
            </div>
            {v.voice.mode === "reuse" && (
              <select aria-label="Brand to take the voice from" value={v.voice.from} onChange={(e) => set({ voice: { ...v.voice, from: e.target.value } })}>
                <option value="">Choose a brand</option>
                {options.voices.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
              </select>
            )}
            {v.voice.mode === "design" && (
              <VoiceDesigner brand={voiceBrand ?? { name: brandName, language: "en", about: "", audience: "", tone: "" }} voice={v.voice} onChange={(voice) => set({ voice })}
                character={v.character.mode === "create" && (v.character.name.trim() || v.character.fields.what.trim()) ? { name: v.character.name.trim(), description: [v.character.fields.what, v.character.fields.personality].map((x) => x.trim()).filter(Boolean).join(". ") } : undefined} />
            )}
            {v.voice.mode === "upload" && (
              <>
                <input type="file" aria-label="Voice sample WAV" accept="audio/wav,.wav" onChange={(e) => { const f = e.target.files?.[0]; void wav.send(f).then((u) => { if (u || !f) set({ voice: { ...v.voice, wav: u ? { id: u.id, name: u.name } : null } }); }); }} />
                {wav.busy && <p className="muted">Uploading</p>}
                {wav.error && <p className="error">{wav.error}</p>}
                {v.voice.wav && <p className="muted">{v.voice.wav.name} uploaded.</p>}
                <textarea rows={3} aria-label="Words spoken in the sample" placeholder="Type exactly what is said in the sample" value={v.voice.text} onChange={(e) => set({ voice: { ...v.voice, text: e.target.value } })} />
                {problems.voiceText && <p className="error">{problems.voiceText}</p>}
                <p className="muted">A WAV of 10 to 30 seconds of one clear voice, up to 25 MB.</p>
              </>
            )}
          </Row>
        </Card>
      )}

      <Card title="Character (optional)" intro="A mascot that appears in every reel. Without one, reels use the full-width layout and work completely.">
        <Row label="Character" {...(problems.character ? { problem: problems.character } : {})}>
          <div className="radios" role="radiogroup" aria-label="Character">
            {([["none", "None"], ["create", "Create one"], ["import", "Use one already on this machine"]] as const).map(([m, label]) => (
              <label key={m} className="radio"><input type="radio" name="character" checked={v.character.mode === m} disabled={m === "import" && options.characters.length === 0} onChange={() => set({ character: { ...v.character, mode: m } })} /> {label}{m === "import" && options.characters.length === 0 ? " (none found)" : ""}</label>
            ))}
          </div>
        </Row>
        {v.character.mode === "import" && (
          <Row label="Which character" help="Found in mascot/ on this machine.">
            <select aria-label="Character to use" value={v.character.id} onChange={(e) => set({ character: { ...v.character, id: e.target.value } })}>
              <option value="">Choose</option>
              {options.characters.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="text" aria-label="Character name" placeholder="Name shown in the hub" value={v.character.name} onChange={(e) => set({ character: { ...v.character, name: e.target.value } })} />
          </Row>
        )}
        {v.character.mode === "create" && (
          <>
            <div className="warn-box" role="note"><strong>This step needs iteration and may not give a finished character.</strong> You make a reference sheet with an AI image tool, upload it, and the hub tries a first flat 3D version with Claude and Blender. Expect to give notes and run it again. You can skip the sheet now and do it on the Character page later.</div>
            <Row label="Name">
              <input type="text" aria-label="Character name" value={v.character.name} maxLength={80} placeholder="Bun" onChange={(e) => set({ character: { ...v.character, name: e.target.value } })} />
            </Row>
            <CharacterPromptBuilder brandName={brandName} colors={colors} fields={v.character.fields} onChange={(fields) => set({ character: { ...v.character, fields } })} />
            <Row label="Reference sheet" help="PNG or JPG, up to 10 MB." {...(sheet.error ? { problem: sheet.error } : {})}>
              <input type="file" aria-label="Reference sheet" accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={(e) => { const f = e.target.files?.[0]; void sheet.send(f).then((u) => { if (u || !f) set({ character: { ...v.character, sheet: u } }); }); }} />
              {sheet.busy && <p className="muted">Uploading</p>}
              {v.character.sheet && <img className="sheet-thumb" alt="Reference sheet" src={v.character.sheet.url} />}
            </Row>
          </>
        )}
      </Card>

      <Card title="Daily loop">
        <Row label="Run the daily loop for this brand" help="Off by default. Once a day it reads your numbers and proposes ideas; nothing is made until you approve. You can switch it on later in Settings.">
          <button type="button" className="switch" role="switch" aria-checked={v.daily} aria-label="Run the daily loop for this brand" onClick={() => set({ daily: !v.daily })} />
        </Row>
      </Card>
    </>
  );
}
