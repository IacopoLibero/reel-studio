import { useEffect, useState } from "react";
import { api, type BrandStyle, type FontList } from "../api";
import { announceBrandsChanged, useLoad } from "../hooks";
import { ClosingPreview, ColorField, FontField, Text } from "../creator/fields";
import { LogoField } from "./LogoField";
import type { BrandSummary } from "../../src/shared/types";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** What is wrong with a style, by field. Empty when it can be saved. */
export function styleProblems(s: BrandStyle): Record<string, string> {
  const p: Record<string, string> = {};
  for (const k of ["background", "text", "accent", "secondary"] as const) if (!HEX.test(s.colors[k])) p[`color-${k}`] = "Colours look like #d94a3d";
  for (const k of ["headline", "body"] as const) if (!s.fonts[k].trim()) p[`font-${k}`] = "A font name is needed";
  return p;
}

/** Colours, fonts and the two closing lines of a brand that already exists. Saves on its own: it is not part of the settings draft. */
export function BrandStyleSection({ brand }: { brand: BrandSummary }) {
  const loaded = useLoad<BrandStyle>(api.brandStyle, [brand.slug]);
  const fonts = useLoad<FontList>(api.fonts);
  const [style, setStyle] = useState<BrandStyle | null>(null);
  const [saved, setSaved] = useState<BrandStyle | null>(null); // what is on disk: the baseline for "unsaved changes"
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (loaded.data) { setStyle(loaded.data); setSaved(loaded.data); } }, [loaded.data]);

  if (!style) return <>{loaded.error ? <p className="error">{loaded.error}</p> : <p className="muted">Loading</p>}</>;
  const problems = styleProblems(style);
  const dirty = JSON.stringify(style) !== JSON.stringify(saved);
  const c = style.colors;
  const list = fonts.data ?? { names: [], checked: false };
  const save = () => {
    setBusy(true); setMsg(null);
    api.saveBrandStyle(style)
      .then((s) => { setSaved(s); setStyle((cur) => (JSON.stringify(cur) === JSON.stringify(style) ? s : cur)); announceBrandsChanged(); setMsg({ ok: true, text: "Saved. New reels use it; reels already made are not redrawn." }); })
      .catch((e: Error) => setMsg({ ok: false, text: e.message }))
      .finally(() => setBusy(false));
  };
  return (
    <>
      <LogoField colors={c} initial={brand.hasLogo} />
      <ColorField label="Background" value={c.background} problem={problems["color-background"]} onChange={(v) => setStyle({ ...style, colors: { ...c, background: v } })} against={c.text} againstLabel="the text colour" />
      <ColorField label="Text" value={c.text} problem={problems["color-text"]} onChange={(v) => setStyle({ ...style, colors: { ...c, text: v } })} />
      <ColorField label="Accent" help="Use it only on what matters." value={c.accent} problem={problems["color-accent"]} onChange={(v) => setStyle({ ...style, colors: { ...c, accent: v } })} against={c.background} />
      <ColorField label="Second accent" help="Rare, for a second highlight." value={c.secondary} problem={problems["color-secondary"]} onChange={(v) => setStyle({ ...style, colors: { ...c, secondary: v } })} against={c.background} />
      <FontField label="Headline font" value={style.fonts.headline} names={list.names} checked={list.checked} problem={problems["font-headline"]} onChange={(v) => setStyle({ ...style, fonts: { ...style.fonts, headline: v } })} />
      <FontField label="Body font" value={style.fonts.body} names={list.names} checked={list.checked} problem={problems["font-body"]} onChange={(v) => setStyle({ ...style, fonts: { ...style.fonts, body: v } })} />
      {(["A", "B"] as const).map((k) => (
        <div key={k} className="closing-pair">
          <div>
            <Text label={`Closing ${k}: label`} value={style.closing[k].label} help={k === "A" ? "About what the brand offers." : "General advice, asks to follow."} onChange={(v) => setStyle({ ...style, closing: { ...style.closing, [k]: { ...style.closing[k], label: v } } })} />
            <Text label={`Closing ${k}: spoken line`} value={style.closing[k].line} onChange={(v) => setStyle({ ...style, closing: { ...style.closing, [k]: { ...style.closing[k], line: v } } })} />
          </div>
          <ClosingPreview label={style.closing[k].label} line={style.closing[k].line} website={brand.website} colors={c} />
        </div>
      ))}
      <div className="row">
        <button type="button" className="btn primary" disabled={!dirty || busy || Object.keys(problems).length > 0} onClick={save}>{busy ? "Saving" : "Save style"}</button>
        {dirty && <button type="button" className="btn" disabled={busy} onClick={() => { if (saved) setStyle(saved); setMsg(null); }}>Discard</button>}
        {msg && <span className={msg.ok ? "muted" : "error"} aria-live="polite">{msg.text}</span>}
      </div>
    </>
  );
}
