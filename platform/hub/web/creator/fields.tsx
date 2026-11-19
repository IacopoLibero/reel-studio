import { useId, type ReactNode } from "react";
import { Row } from "../components/SettingsParts";
import { contrastNote, wordCount } from "./draft";

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

/** A font name with the Google fonts Remotion can load as suggestions; says at once when the name is not one of them. */
export function FontField({ label, value, onChange, names, checked, problem }: { label: string; value: string; onChange: (v: string) => void; names: readonly string[]; checked: boolean; problem?: string | undefined }) {
  const id = useId(), list = `${id}-fonts`;
  const near = checked && value && !names.includes(value) ? names.filter((n) => n.toLowerCase().includes(value.toLowerCase())).slice(0, 5) : [];
  return (
    <Row label={label} htmlFor={id} help={checked ? "A Google font Remotion can load. Start typing to see names." : "The font list is not available here, so the name is not checked."} {...(problem ? { problem } : {})}>
      <input id={id} type="text" list={list} value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id={list}>{names.slice(0, 2000).map((n) => <option key={n} value={n} />)}</datalist>
      {near.length > 0 && <p className="muted">Did you mean: {near.map((n, i) => <span key={n}>{i > 0 && ", "}<button type="button" className="linklike" onClick={() => onChange(n)}>{n}</button></span>)}?</p>}
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
