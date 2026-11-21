import { useEffect, useId, useState, type ReactNode } from "react";
import { Row } from "../components/SettingsParts";
import { contrastNote, sharedKeywords, wordCount } from "./draft";
import { googleFontCss, previewableFont } from "./font-preview";

export function Text({ label, help, problem, value, onChange, placeholder, multiline, type = "text" }: { label: string; help?: string; problem?: string | undefined; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; type?: string }) {
  const id = useId();
  return (
    <Row label={label} htmlFor={id} {...(help ? { help } : {})} {...(problem ? { problem } : {})}>
      {multiline
        ? <textarea id={id} rows={3} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        : <input id={id} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
    </Row>
  );
}

/** A colour picker next to its hex text. The note under it says whether it reads well against `against`. */
export function ColorField({ label, help, value, onChange, against, againstLabel, problem }: { label: string; help?: string; value: string; onChange: (v: string) => void; against?: string; againstLabel?: string; problem?: string | undefined }) {
  const id = useId();
  const note = against ? contrastNote(value, against, `On ${againstLabel ?? "the background"}`) : null;
  return (
    <Row label={label} htmlFor={id} {...(help ? { help } : {})} {...(problem ? { problem } : {})}>
      <div className="color-field">
        <input type="color" aria-label={`${label} picker`} value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value)} />
        <input id={id} type="text" className="mono" value={value} maxLength={7} onChange={(e) => onChange(e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`)} />
      </div>
      {note && <p className={`note ${note.level}`}>{note.text}</p>}
    </Row>
  );
}

type FontState = "none" | "loading" | "ready" | "failed";

/** Loads the Google font `name` into the page (once per name) and says when it can be used. Needs the internet, like the render does. */
function useGoogleFont(name: string, enabled: boolean): FontState {
  const [state, setState] = useState<FontState>("none");
  useEffect(() => {
    if (!enabled) { setState("none"); return; }
    setState("loading");
    let live = true;
    const id = `gfont-${encodeURIComponent(name.trim())}`;
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (link && !link.sheet) { link.remove(); link = null; } // an earlier try failed or never finished: try again
    if (!link) { link = document.createElement("link"); link.id = id; link.rel = "stylesheet"; link.href = googleFontCss(name); document.head.appendChild(link); }
    const done = () => { void document.fonts.load(`32px "${name.trim()}"`).then((f) => live && setState(f.length ? "ready" : "failed"), () => live && setState("failed")); };
    if (link.sheet) done(); else { link.addEventListener("load", done, { once: true }); link.addEventListener("error", () => live && setState("failed"), { once: true }); }
    return () => { live = false; };
  }, [name, enabled]);
  return state;
}

/** A font name with the Google fonts Remotion can load as suggestions, a preview of how it looks, and a hint when the name is not one of them. */
export function FontField({ label, value, onChange, names, checked, problem, sample = "Why does your bread go hard?" }: { label: string; value: string; onChange: (v: string) => void; names: readonly string[]; checked: boolean; problem?: string | undefined; sample?: string }) {
  const id = useId(), list = `${id}-fonts`;
  const near = checked && value && !names.includes(value) ? names.filter((n) => n.toLowerCase().includes(value.toLowerCase())).slice(0, 5) : [];
  const known = previewableFont(value, names, checked);
  const [shown, setShown] = useState(value);
  useEffect(() => { const t = window.setTimeout(() => setShown(value), 350); return () => window.clearTimeout(t); }, [value]);
  const state = useGoogleFont(shown, known && previewableFont(shown, names, checked));
  return (
    <Row label={label} htmlFor={id} help={checked ? "A Google font Remotion can load. Start typing to see names." : "The font list is not available here, so the name is not checked."} {...(problem ? { problem } : {})}>
      <input id={id} type="text" list={list} value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id={list}>{names.slice(0, 2000).map((n) => <option key={n} value={n} />)}</datalist>
      {near.length > 0 && <p className="muted">Did you mean: {near.map((n, i) => <span key={n}>{i > 0 && ", "}<button type="button" className="linklike" onClick={() => onChange(n)}>{n}</button></span>)}</p>}
      {known && (
        <div className="font-preview" aria-label={`Preview of ${value}`}>
          <span style={state === "ready" ? { fontFamily: `"${shown.trim()}", sans-serif` } : { opacity: 0.5 }}>{sample}</span>
          {state === "loading" && <span className="muted"> Loading the preview</span>}
          {state === "failed" && <span className="muted"> No preview: the font could not be loaded (no internet?). The reel still uses it.</span>}
        </div>
      )}
    </Row>
  );
}

/** How a closing option will look on the last card of a reel: the brand colours, the label and the spoken line. */
export function ClosingPreview({ label, line, website, colors }: { label: string; line: string; website: string; colors: { background: string; text: string; accent: string } }) {
  const words = wordCount(line);
  return (
    <div>
      <div className="closing-card" style={{ background: colors.background, color: colors.text }} aria-label={`Preview: ${label}`}>
        <div className="closing-label" style={{ color: colors.accent }}>{label || "Label"}</div>
        <div className="closing-site" style={{ color: colors.accent }}>{website || "your-website.com"}</div>
        <div className="closing-line">&ldquo;{line || "The spoken closing line"}&rdquo;</div>
      </div>
      <p className={words > 12 ? "error" : "muted"}>{words} {words === 1 ? "word" : "words"}{words > 12 ? ": 12 or fewer sounds better at the end of a reel" : ""}</p>
    </div>
  );
}

export function Card({ title, children, intro }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <section className="set-sec card" aria-label={title}>
      <h2>{title}</h2>
      {intro && <p className="muted set-intro">{intro}</p>}
      {children}
    </section>
  );
}

/** The two keyword boxes that decide which closing a reel gets from its question. */
export function ClosingKeywords({ value, onChange }: { value: { product: string; general: string }; onChange: (v: { product: string; general: string }) => void }) {
  const shared = sharedKeywords(value);
  return (
    <>
      <Text label="Words for closing A (what the brand offers)" multiline value={value.product} placeholder={"menu\nqr code\ntranslat*"} help="One per line. A question with one of these words ends with option A. A * at the end means any word starting with it." onChange={(v) => onChange({ ...value, product: v })} />
      <Text label="Words for closing B (advice, rules, daily work)" multiline value={value.general} placeholder={"tax\nhiring\nregulation"} help="One per line. A question with one of these and none from A ends with option B. A reel that matches nothing also gets B." onChange={(v) => onChange({ ...value, general: v })} />
      {shared.length > 0 && <p className="note large-text-only">In both boxes: {shared.join(", ")}. The word counts for closing A only.</p>}
    </>
  );
}
