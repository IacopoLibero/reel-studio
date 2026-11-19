import { useState, type ReactNode } from "react";
import { DAY_NAMES, cleanTimes, daySummary } from "../settings-form";

/** A titled card for one group of settings. The id is the scroll target of the side menu. */
export function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section className="set-sec card" id={id} aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`}>{title}</h2>
      {intro && <p className="muted set-intro">{intro}</p>}
      {children}
    </section>
  );
}

/** Label and help on the left, the control on the right; a problem replaces the help in red. */
export function Row({ label, help, problem, htmlFor, children }: { label: string; help?: string; problem?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-lab">
        <label htmlFor={htmlFor}>{label}</label>
        {problem ? <p className="error" role="alert">{problem}</p> : help && <p className="muted">{help}</p>}
      </div>
      <div className="set-ctl">{children}</div>
    </div>
  );
}

/** One time per chip, native time field, remove button, and an add button. */
export function TimesEditor({ times, onChange, problem, dayIndex }: { times: string[]; onChange: (t: string[]) => void; problem?: string; dayIndex: number }) {
  const name = DAY_NAMES[dayIndex];
  return (
    <div className="day-row">
      <div className="day-name">
        <strong>{name}</strong>
        <span className="muted">{daySummary(times)}</span>
      </div>
      <div className="day-times">
        {times.map((t, i) => (
          <span className="time-chip" key={i}>
            <input type="time" aria-label={`${name} time ${i + 1}`} value={t} onChange={(e) => onChange(times.map((x, j) => (j === i ? e.target.value : x)))} />
            <button type="button" className="x" aria-label={`Remove ${name} time ${t || i + 1}`} onClick={() => onChange(times.filter((_, j) => j !== i))}>×</button>
          </span>
        ))}
        <button type="button" className="btn small" onClick={() => onChange([...times, ""])}>Add time</button>
        {problem && <p className="error" role="alert">{problem}</p>}
      </div>
    </div>
  );
}

/** Copies one day's times onto several days, so a pattern is quick to set up. */
export function CopyTimes({ days, onChange }: { days: string[][]; onChange: (d: string[][]) => void }) {
  const [from, setFrom] = useState(1);
  const apply = (targets: number[]) => onChange(days.map((d, i) => (targets.includes(i) && i !== from ? cleanTimes(days[from]) : d)));
  return (
    <div className="row wrap set-copy">
      <span className="muted">Copy</span>
      <select aria-label="Copy times from" value={from} onChange={(e) => setFrom(Number(e.target.value))}>
        {DAY_NAMES.map((n, i) => <option value={i} key={n}>{n}</option>)}
      </select>
      <button type="button" className="btn small" onClick={() => apply([1, 2, 3, 4, 5])}>to Monday to Friday</button>
      <button type="button" className="btn small" onClick={() => apply([0, 1, 2, 3, 4, 5, 6])}>to every day</button>
    </div>
  );
}

/** A list of words shown as chips, with an input that adds on Enter or comma. */
export function Chips({ items, onChange, placeholder, label }: { items: string[]; onChange: (i: string[]) => void; placeholder: string; label: string }) {
  const [text, setText] = useState("");
  const add = () => {
    const words = text.split(",").map((w) => w.trim()).filter((w) => w && !items.includes(w));
    if (words.length) onChange([...items, ...words]);
    setText("");
  };
  return (
    <div className="chips-box">
      <div className="chips">
        {items.map((w) => (
          <span className="pill chip" key={w}>{w}<button type="button" className="x" aria-label={`Remove ${w}`} onClick={() => onChange(items.filter((x) => x !== w))}>×</button></span>
        ))}
        {!items.length && <span className="muted">Nothing yet</span>}
      </div>
      <input type="text" aria-label={label} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }} onBlur={add} />
    </div>
  );
}
