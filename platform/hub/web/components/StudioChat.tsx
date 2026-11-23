import { useEffect, useRef, useState } from "react";
import type { Job } from "../../src/shared/types";
import { api, type StudioView } from "../api";
import { ProgressBar } from "./JobCard";

interface Props { messages: StudioView["chat"]; running: Job | undefined; disabled: boolean; onSent: () => void }

/** The conversation about the preview: each message is a change request, Claude edits the builder and renders the previews again, until you approve. */
export function StudioChat({ messages, running, disabled, onSent }: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages.length, running?.log.length]);
  const send = () => {
    const message = text.trim();
    if (!message || sending || running || disabled) return;
    setSending(true); setErr(null);
    api.createJob("character.build", { notes: message }).then(() => { setText(""); onSent(); }).catch((e: Error) => setErr(e.message)).finally(() => setSending(false));
  };
  return (
    <div className="chat">
      <div className="chat-log" role="log" aria-live="polite" aria-label="Conversation with Claude about the character">
        {messages.length === 0 && !running && <p className="muted">Look at the previews and say what to change: "make the arms thicker and attach them to the body", "the head should be rounder", "the neckerchief is too big". Claude changes the model and renders the previews again. Ask a question if you only want to understand something.</p>}
        {messages.map((m, i) => <div key={`${m.jobId}-${m.role}-${i}`} className={`msg ${m.role}`}><div className="who">{m.role === "user" ? "You" : "Claude"}</div><div className="txt">{m.text}</div></div>)}
        {running && (
          <div className="msg claude working">
            <div className="who">Claude · {running.status === "queued" ? "waiting" : running.step || "working"}</div>
            <ProgressBar job={running} />
            <pre className="mono">{running.log.slice(-6).join("\n")}</pre>
            <button type="button" className="btn small" onClick={() => { void api.cancelJob(running.id).catch((e: Error) => setErr(e.message)); }}>Stop</button>
          </div>
        )}
        <div ref={end} />
      </div>
      {err && <p className="error">{err}</p>}
      <div className="row" style={{ alignItems: "flex-end" }}>
        <textarea className="grow" rows={2} value={text} disabled={!!running || disabled} placeholder={running ? "Claude is working…" : "What should change?"} aria-label="What should change in the character"
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button type="button" className="btn primary" disabled={!text.trim() || sending || !!running || disabled} onClick={send}>Send</button>
      </div>
    </div>
  );
}
