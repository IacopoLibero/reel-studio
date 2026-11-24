import { useEffect, useRef, useState } from "react";
import type { Job, Reel } from "../../src/shared/types";
import { api, getBrand, scoped, type ChatMessage, type ReelDetail, type ReelVersion } from "../api";
import { useLoad } from "../hooks";
import { ProgressBar } from "../components/JobCard";
import { SlotPicker } from "../components/SlotPicker";

const fileUrl = (key: string, kind: "mp4" | "cover", v: string): string => scoped(`/reels/file?key=${encodeURIComponent(key)}&kind=${kind}&v=${encodeURIComponent(v)}`);
const size = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`);
const isEditJob = (j: Job, folder: string): boolean => j.type === "reel.edit" && j.params.folder === folder;
const active = (j: Job): boolean => j.status === "queued" || j.status === "running";

/**
 * One reel on a page of its own (not a dialog): the video, its caption, script, plan and files, and a conversation with Claude that changes it.
 * Each message is one `reel.edit` job; Claude keeps the same session, so "a bit smaller" after "make it bigger" makes sense.
 * The reel as it was before each change is kept in the reel's `.versions` folder (the last three).
 */
export function ReelPage({ folder, jobs }: { folder: string; jobs: Job[] }) {
  const { data, error, reload } = useLoad(() => api.reelPage(folder), [folder]);
  const [picking, setPicking] = useState(false);
  const mine = jobs.filter((j) => isEditJob(j, folder));
  const running = mine.find(active) ?? null;
  const finished = mine.filter((j) => !active(j)).length;
  // When a change ends, read the reel again: a new video, caption or cover, and Claude's answer in the conversation.
  useEffect(reload, [finished, running?.id]);

  if (error) return <><p><a href={`#/${getBrand()}/reels`}>← Reels</a></p><p className="error">{error}</p></>;
  if (!data) return <p className="muted">Loading…</p>;
  const { reel } = data;
  const asListReel: Reel = { key: reel.key, brand: reel.brand, folder: reel.folder, n: reel.n, name: reel.name, mp4: reel.mp4, hasCaption: !!reel.caption, captionStart: reel.caption.split("\n")[0] ?? "", hasCover: reel.hasCover, schedule: reel.schedule, state: reel.schedule ? "scheduled" : reel.mp4 && !!reel.caption && reel.hasCover ? "to-schedule" : "incomplete", scheduling: false };
  const ready = !!reel.mp4 && !!reel.caption && reel.hasCover;
  return (
    <>
      <p><a href={`#/${getBrand()}/reels`}>← Reels</a></p>
      <div className="row wrap" style={{ alignItems: "baseline" }}>
        <h1 style={{ margin: 0 }}>{reel.n} · {reel.name}</h1>
        {reel.schedule?.status === "posted" ? <span className="badge done">Posted {reel.schedule.at}</span>
          : reel.schedule ? <span className="badge scheduled">Scheduled {reel.schedule.at}</span> : null}
        <span className="grow" />
        {!reel.schedule && <button className="btn primary" disabled={!ready || !!running} title={ready ? "" : "Needs MP4, caption and cover"} onClick={() => setPicking(true)}>Schedule</button>}
      </div>
      <div className="reel-layout">
        <div className="reel-media">
          {reel.mp4
            ? <video className="reel-video" controls playsInline preload="metadata" poster={reel.hasCover ? fileUrl(reel.key, "cover", reel.version) : undefined} src={fileUrl(reel.key, "mp4", reel.version)} />
            : <div className="card muted">This reel has no video yet.</div>}
          {reel.hasCover && <img className="reel-cover" src={fileUrl(reel.key, "cover", reel.version)} alt="Cover" />}
        </div>
        <div className="reel-side">
          <Chat folder={folder} reel={reel} messages={data.chat.messages} running={running} jobs={mine} versions={data.versions} onSent={reload} />
          <Details reel={reel} />
        </div>
      </div>
      {picking && <SlotPicker reel={asListReel} onClose={() => { setPicking(false); reload(); }} />}
    </>
  );
}

function Chat({ folder, reel, messages, running, jobs, versions, onSent }: { folder: string; reel: ReelDetail; messages: ChatMessage[]; running: Job | null; jobs: Job[]; versions: ReelVersion[]; onSent: () => void }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  // A message whose job is queued or running is not in the saved conversation yet (the job saves it when it starts): show it here.
  const saved = new Set(messages.filter((m) => m.role === "user").map((m) => m.jobId));
  const pending = jobs.filter((j) => active(j) && !saved.has(j.id)).map((j): ChatMessage => ({ role: "user", text: String(j.params.message ?? ""), at: j.createdAt, jobId: j.id }));
  const shown = [...messages, ...pending];
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [shown.length, running?.log.length]);

  const send = () => {
    const message = text.trim();
    if (!message || sending || running) return;
    setSending(true); setErr(null);
    api.editReel(folder, message).then(() => { setText(""); onSent(); }).catch((e: Error) => setErr(e.message)).finally(() => setSending(false));
  };
  return (
    <div className="card chat">
      <strong>Change this reel with Claude</strong>
      <div className="chat-log" role="log" aria-live="polite">
        {shown.length === 0 && <p className="muted">Say what to change: "make the headline bigger", "shorten the closing", "use the surprised face in scene 3". Claude changes the reel and renders it again. Ask a question first if you only want to understand something.</p>}
        {shown.map((m, i) => <div key={`${m.jobId}-${m.role}-${i}`} className={`msg ${m.role}`}><div className="who">{m.role === "user" ? "You" : "Claude"}</div><div className="txt">{m.text}</div></div>)}
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
        <textarea className="grow" rows={2} value={text} disabled={!!running} placeholder={running ? "Claude is working…" : "What should change?"} aria-label="What should change in this reel"
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button type="button" className="btn primary" disabled={!text.trim() || sending || !!running} onClick={send}>Send</button>
      </div>
      <Versions folder={folder} versions={versions} disabled={!!running || sending} onRestored={onSent} onError={setErr} />
      <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
        Before each change the reel is saved (the last three versions are in its folder, <code>.versions</code>).
        {reel.schedule && " This reel is already on Instagram: a change here does not change the copy there."}
      </p>
    </div>
  );
}

function Details({ reel }: { reel: ReelDetail }) {
  return (
    <>
      <div className="card"><strong>Caption</strong><pre className="reel-text">{reel.caption || "No caption yet."}</pre></div>
      {reel.script.length > 0 && <div className="card"><strong>Script</strong><ol className="reel-script">{reel.script.map((s, i) => <li key={i}>{s}</li>)}</ol></div>}
      {reel.plan && <details className="card"><summary><strong>Plan</strong></summary><pre className="reel-text">{reel.plan}</pre></details>}
      <details className="card"><summary><strong>Files</strong> <span className="muted">· {reel.files.length}</span></summary>
        <ul className="reel-files">{reel.files.map((f) => <li key={f.name}><span className="mono">{f.name}{f.dir ? "/" : ""}</span>{!f.dir && <span className="muted"> {size(f.size)}</span>}</li>)}</ul>
        {reel.hasCode && <p className="muted" style={{ fontSize: 12 }}>The reel's code is in its <code>code/</code> folder.</p>}
      </details>
    </>
  );
}

const when = (iso: string): string => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

/** The versions saved before each change. Undo puts one back (the reel as it is now is saved first, so the undo can be undone). */
function Versions({ folder, versions, disabled, onRestored, onError }: { folder: string; versions: ReelVersion[]; disabled: boolean; onRestored: () => void; onError: (m: string | null) => void }) {
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (versions.length === 0) return null;
  const restore = (name: string) => {
    setBusy(true); onError(null);
    api.restoreReel(folder, name).then(() => { setAsking(null); onRestored(); }).catch((e: Error) => onError(e.message)).finally(() => setBusy(false));
  };
  const [latest, ...older] = versions;
  return (
    <div className="versions">
      <div className="row wrap" style={{ gap: 8 }}>
        <button type="button" className="btn small" disabled={disabled || busy} onClick={() => setAsking(latest!.name)} title="Put the reel back as it was before the last change">Undo the last change</button>
        {older.length > 0 && <details style={{ display: "inline-block" }}><summary className="muted" style={{ cursor: "pointer", fontSize: 12 }}>Older versions ({older.length})</summary>
          <ul style={{ listStyle: "none", padding: 0, margin: "6px 0" }}>{older.map((v) => (
            <li key={v.name} className="row" style={{ gap: 8, marginBottom: 4 }}><span className="muted" style={{ fontSize: 12 }}>{when(v.at)}</span>
              <button type="button" className="btn small" disabled={disabled || busy} onClick={() => setAsking(v.name)}>Restore</button></li>
          ))}</ul></details>}
      </div>
      {asking && (
        <div className="card warn" style={{ marginTop: 8 }}>
          <strong>Go back to the version of {when(versions.find((v) => v.name === asking)?.at ?? asking)}?</strong>
          <p className="muted" style={{ margin: "6px 0" }}>The video, caption, cover and code are replaced by that version. The reel as it is now is saved first, so you can undo this too.</p>
          <div className="row"><button type="button" className="btn primary small" disabled={busy} onClick={() => restore(asking)}>Yes, go back</button><button type="button" className="btn small" onClick={() => setAsking(null)}>Keep it as it is</button></div>
        </div>
      )}
    </div>
  );
}
