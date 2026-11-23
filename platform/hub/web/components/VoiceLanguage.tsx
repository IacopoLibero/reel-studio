import { useState } from "react";
import { api, type VoiceLanguage as Lang } from "../api";
import { announceBrandsChanged, useLoad } from "../hooks";

/**
 * Settings > Voice: the language of this brand's reels. The script is written in it, the voice speaks it, Whisper times its words and the captions are broken for it.
 * It is the brand's, so each brand has its own (and its own voice sample: chosen when the brand is created).
 */
export function VoiceLanguage({ current, brandName }: { current: string; brandName: string }) {
  const langs = useLoad<Lang[]>(api.voiceLanguages);
  const [value, setValue] = useState(current.slice(0, 2).toLowerCase());
  const [saved, setSaved] = useState(value);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (langs.error) return <p className="error">{langs.error}</p>;
  if (!langs.data) return <p className="muted">Loading…</p>;
  const known = langs.data.some((l) => l.code === value);
  const save = () => {
    setBusy(true); setMsg(null);
    api.setBrandLanguage(value)
      .then((r) => { setSaved(r.language); setMsg({ ok: true, text: `Saved. The next reel of ${brandName} is made in ${r.name}. Reels already made are not changed.` }); announceBrandsChanged(); })
      .catch((e: Error) => setMsg({ ok: false, text: e.message }))
      .finally(() => setBusy(false));
  };
  return (
    <div className="card" style={{ margin: "0 0 12px" }}>
      <strong>Language of {brandName}'s reels</strong>
      <p className="muted" style={{ margin: "4px 0 8px" }}>The script is written in it, the voice speaks it and the captions follow it. Every brand has its own language and its own voice sample (chosen when the brand was created).</p>
      <div className="row wrap">
        <select aria-label="Language of the reels" value={value} onChange={(e) => { setValue(e.target.value); setMsg(null); }}>
          {!known && <option value={value}>{value} (not one the voice speaks)</option>}
          {langs.data.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
        <button type="button" className="btn primary" disabled={busy || value === saved || !known} onClick={save}>Save</button>
        {msg && <span className={msg.ok ? "muted" : "error"} style={{ margin: 0 }}>{msg.text}</span>}
      </div>
      <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>The list is the languages of the best voice mode (VoxCPM2). The light voice mode speaks English only. The voice sample should be in the same language as the reels; if you change the language, record or choose a sample in the new one for the best result.</p>
    </div>
  );
}
