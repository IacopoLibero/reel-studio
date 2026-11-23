import { useState } from "react";
import { buildImagePrompt, type CharacterFields, type PromptColors } from "../../src/shared/character-prompt";

/** The prompt for an AI image tool, built live from the fields and the brand colours. Copy it, make the sheet elsewhere, upload it. */
export function CharacterPromptBuilder({ brandName, colors, fields, onChange, onBlur }: { brandName: string; colors: PromptColors; fields: CharacterFields; onChange: (f: CharacterFields) => void; onBlur?: () => void }) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const prompt = buildImagePrompt(fields, colors, brandName);
  const set = (k: keyof CharacterFields, v: string) => onChange({ ...fields, [k]: v });
  const copy = async () => {
    try { await navigator.clipboard.writeText(prompt); setCopied("ok"); } catch { setCopied("fail"); }
    window.setTimeout(() => setCopied(null), 2500);
  };
  return (
    <div className="prompt-builder">
      <label htmlFor="cp-what">What is the character?</label>
      <textarea id="cp-what" rows={3} value={fields.what} maxLength={1500} placeholder="a friendly loaf of bread with arms and legs" onChange={(e) => set("what", e.target.value)} onBlur={onBlur} />
      <label htmlFor="cp-pers">Personality</label>
      <textarea id="cp-pers" rows={3} value={fields.personality} maxLength={1500} placeholder="cheerful, a little clumsy" onChange={(e) => set("personality", e.target.value)} onBlur={onBlur} />
      <label htmlFor="cp-extra">Anything else (accessories, things to avoid)</label>
      <textarea id="cp-extra" rows={3} value={fields.extra} maxLength={1500} placeholder="wears a small chef hat" onChange={(e) => set("extra", e.target.value)} onBlur={onBlur} />
      <label htmlFor="cp-prompt">Prompt for your AI image tool</label>
      <textarea id="cp-prompt" className="mono" rows={11} readOnly value={prompt} onFocus={(e) => e.currentTarget.select()} />
      <div className="row">
        <button type="button" className="btn primary" onClick={() => void copy()}>Copy prompt</button>
        {copied === "ok" && <span className="muted" role="status">Copied.</span>}
        {copied === "fail" && <span className="error" role="status">Your browser blocked copying. Select the text above and copy it yourself.</span>}
      </div>
      <p className="muted">The colours come from the brand and are inserted for you. The sheet has the character from the front, three-quarter and side, and the head with {8} expressions, on a plain background.</p>
    </div>
  );
}
