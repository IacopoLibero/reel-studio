import { useEffect, useRef, useState } from "react";
import type { CharacterTurn, InterviewMessage } from "../api";
import type { CharacterFields } from "../../src/shared/character-prompt";

interface Props {
  /** Sends the conversation to the hub (with the brand's context) and returns the assistant's turn. */
  ask: (messages: InterviewMessage[]) => Promise<CharacterTurn>;
  name: string;
  fields: CharacterFields;
  /** Called after every answer with what the assistant has worked out: it fills the name and the three fields. */
  onFill: (name: string, fields: CharacterFields) => void;
}

/** A chat with the assistant about the mascot: it knows the brand, asks one thing at a time and fills the fields the image prompt is built from. */
export function CharacterChat({ ask: send0, name, fields, onFill }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const latest = useRef({ name, fields });
  useEffect(() => { latest.current = { name, fields }; });
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages.length, busy]);

  const ask = async (next: InterviewMessage[]) => {
    setBusy(true); setError(null);
    try {
      const t = await send0(next);
      setMessages([...next, { role: "assistant", text: t.say }]);
      setDone(t.done);
      const c = t.character;
      if (c.name || c.what || c.personality || c.extra) onFill(c.name || latest.current.name, { what: c.what || latest.current.fields.what, personality: c.personality || latest.current.fields.personality, extra: c.extra || latest.current.fields.extra });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const start = () => { setOpen(true); if (messages.length === 0) void ask([]); };
  const send = (text = input) => {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    void ask([...messages, { role: "user", text: t }]);
  };

  if (!open) return <p><button type="button" className="btn primary" onClick={start}>Design the character with the assistant</button> <span className="muted">It knows the brand and asks about the look and the personality, then fills the fields below.</span></p>;
  return (
    <div className="character-chat">
      <div className="chat" role="log" aria-live="polite" aria-label="Conversation about the character">
        {messages.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.text}</div>)}
        {busy && <div className="msg assistant muted">Thinking</div>}
        <div ref={end} />
      </div>
      {error && <p className="error" role="alert">{error} <button type="button" className="btn small" onClick={() => void ask(messages)}>Try again</button></p>}
      <div className="chat-input">
        <textarea rows={2} aria-label="Your answer about the character" value={input} disabled={busy} placeholder="Type your answer. Enter sends, Shift+Enter adds a line." onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <div className="row"><button type="button" className="btn primary" disabled={busy || !input.trim()} onClick={() => send()}>Send</button>
          {messages.some((m) => m.role === "user") && !done && <button type="button" className="btn" disabled={busy} onClick={() => send("That is enough. Please finish with what we have.")}>Finish now</button>}
          {done && <span className="muted">Done: edit the fields below if you like, then copy the prompt.</span>}</div>
      </div>
    </div>
  );
}
