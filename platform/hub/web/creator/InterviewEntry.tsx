import { useEffect, useMemo, useRef, useState } from "react";
import { api, type CreatorOptions, type InterviewMessage, type InterviewTurn } from "../api";
import { Card } from "./fields";
import { Extras } from "./Extras";
import { brandToDraft } from "./draft";
import { emptyExtras, extrasProblems, extrasToRequest, type ExtrasState } from "./extras";
import { CreateStatus, useCreate, type Created } from "./useCreate";

type Summary = Record<string, unknown>;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const text = (v: unknown): string => (typeof v === "string" ? v : "");

/** What the assistant has understood so far, as a short list that fills in while the conversation goes on. */
export function SummaryPanel({ summary }: { summary: Summary }) {
  const c = obj(summary.colors), f = obj(summary.fonts), cl = obj(summary.closing), ch = obj(summary.character), o = obj(summary.offer);
  const rows: [string, string][] = [
    ["Name", text(summary.name)], ["Reels language", text(summary.language)], ["Website", text(summary.website)], ["What it does", text(summary.about)],
    ["Audience", text(summary.audience)], ["Tone", text(summary.tone)],
    ["Colours", ["background", "text", "accent", "secondary"].map((k) => text(c[k])).filter(Boolean).join("  ")],
    ["Fonts", [text(f.headline), text(f.body)].filter(Boolean).join(" / ")],
    ["Closing A", text(obj(cl.A).line)], ["Closing B", text(obj(cl.B).line)],
    ["Offer", [text(o.lastDay), text(o.regex)].filter(Boolean).join(" · ")], ["Instagram", text(summary.instagramAccount)],
    ["Character", ch.wanted === false ? "none" : [text(ch.name), text(ch.description)].filter(Boolean).join(": ")],
  ];
  const colors = ["background", "text", "accent", "secondary"].map((k) => text(c[k])).filter((x) => /^#[0-9a-fA-F]{6}$/.test(x));
  return (
    <aside className="summary-panel" aria-label="What the assistant knows so far">
      <h3>So far</h3>
      {colors.length > 0 && <div className="swatches">{colors.map((x) => <span key={x} title={x} style={{ background: x }} />)}</div>}
      <dl>{rows.map(([k, v]) => <div key={k} className={v ? "" : "empty"}><dt>{k}</dt><dd>{v || "not asked yet"}</dd></div>)}</dl>
    </aside>
  );
}

/** Entry 2: a chat with an assistant that asks one question at a time, then shows brand.json and style.md for review. */
export function InterviewEntry({ options, onCreated }: { options: CreatorOptions; onCreated: (c: Created) => void }) {
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [turn, setTurn] = useState<InterviewTurn | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [json, setJson] = useState("");
  const [style, setStyle] = useState("");
  const [extras, setExtras] = useState<ExtrasState>(emptyExtras);
  const [checkErrors, setCheckErrors] = useState<string[]>([]);
  const started = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const create = useCreate(onCreated);
  const a = options.assistant;

  const ask = async (next: InterviewMessage[]) => {
    setBusy(true); setError(null);
    try {
      const t = await api.interview(next);
      setTurn(t);
      setMessages([...next, { role: "assistant", text: t.say }]);
      if (t.done && t.draft) { setJson(JSON.stringify(t.draft.brand, null, 2)); setStyle(t.draft.styleMd); setCheckErrors(t.draft.errors); }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  useEffect(() => { if (!started.current) { started.current = true; void ask([]); } }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages.length, busy]);

  const send = () => {
    const t = input.trim();
    if (!t || busy) return;
    setInput("");
    void ask([...messages, { role: "user", text: t }]);
  };
  const parsed = useMemo(() => { try { const v = JSON.parse(json) as unknown; return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null; } catch { return null; } }, [json]);
  const draft = parsed ? brandToDraft(parsed) : null;
  const problems = extrasProblems(extras);
  const finished = !!turn?.done && turn.draft !== null;

  const submit = async () => {
    if (!parsed) { setCheckErrors(["brand.json is not valid JSON."]); return; }
    if (Object.keys(problems).length) return;
    const v = await api.validateBrand(parsed).catch((e: Error) => ({ ok: false, errors: [e.message] }));
    setCheckErrors(v.errors);
    if (!v.ok) return;
    void create.start({ source: "interview", brand: parsed, styleMd: style, ...extrasToRequest(extras, {}) });
  };

  return (
    <>
      <p className={a.tested ? "muted" : "warn-box"}>
        Assistant: <strong>{a.kind}</strong>{a.kind !== "claude" && a.command ? ` (${a.command})` : ""}. {a.tested ? "It can read and search the web, but cannot change files, run commands or read your credentials or other brands." : "Only claude is tested. This one reads the prompt on stdin and prints text; it gets no tool limits from the hub, so use one you trust."} Change it in Settings.
      </p>
      <div className="interview">
        <div className="chat" role="log" aria-live="polite" aria-label="Conversation">
          {messages.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.text}</div>)}
          {busy && <div className="msg assistant muted">Thinking</div>}
          <div ref={end} />
        </div>
        <SummaryPanel summary={turn?.summary ?? {}} />
      </div>
      {error && <p className="error" role="alert">{error} <button type="button" className="btn small" onClick={() => void ask(messages)}>Try again</button></p>}
      {!finished && (
        <div className="chat-input">
          <textarea rows={2} aria-label="Your answer" value={input} disabled={busy} placeholder="Type your answer. Enter sends, Shift+Enter adds a line." onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <div className="row"><button type="button" className="btn primary" disabled={busy || !input.trim()} onClick={send}>Send</button>
            {messages.some((m) => m.role === "user") && <button type="button" className="btn" disabled={busy} onClick={() => void ask([...messages, { role: "user", text: "That is enough. Please finish: give me the brand and the style guide to review." }])}>Finish now</button>}</div>
        </div>
      )}
      {finished && (
        <>
          <Card title="Review and edit" intro="This is what will be written. Change anything: brand.json is checked again when you press Create.">
            <label htmlFor="iv-json">brand.json</label>
            <textarea id="iv-json" className="mono tall" rows={18} spellCheck={false} value={json} onChange={(e) => setJson(e.target.value)} />
            <label htmlFor="iv-style">style.md</label>
            <textarea id="iv-style" className="mono tall" rows={14} spellCheck={false} value={style} onChange={(e) => setStyle(e.target.value)} />
            {checkErrors.length > 0 && <ul className="error" role="alert">{checkErrors.map((e) => <li key={e}>{e}</li>)}</ul>}
          </Card>
          <Extras value={extras} onChange={setExtras} options={options} brandName={draft?.name ?? ""} colors={draft?.colors ?? { background: "#ffffff", text: "#000000", accent: "#2f6fed", secondary: "#7a4dff" }} problems={problems} />
          <div className="create-bar"><span className="muted">Creates brand/{draft?.slug || "…"}/ and everything around it.</span><span className="grow" /><button type="button" className="btn primary" disabled={create.busy} onClick={() => void submit()}>{create.busy ? "Creating" : "Create brand"}</button></div>
          <CreateStatus job={create.job} error={create.error} />
        </>
      )}
    </>
  );
}
