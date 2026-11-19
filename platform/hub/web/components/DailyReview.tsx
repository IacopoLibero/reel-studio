import { useState } from "react";
import type { DailyReelData } from "../../src/shared/daily";
import { api } from "../api";
import { ProgressBar } from "./JobCard";
import { DailySlotDialog } from "./DailySlotDialog";

const STATE_LABEL: Record<DailyReelData["state"], string> = { making: "Being made", review: "Waiting for your review", scheduling: "Scheduling", scheduled: "Scheduled", failed: "Failed", dropped: "Discarded" };

export function ReelCard({ date, reel, onChange }: { date: string; reel: DailyReelData; onChange: () => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [slot, setSlot] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); setRejecting(false); setNote(""); onChange(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const job = reel.state === "scheduling" ? reel.scheduleJob : reel.job;
  const active = reel.state === "making" || reel.state === "scheduling";
  return (
    <div className="card reelcard" data-state={reel.state}>
      <div className="row wrap">
        <div className="grow"><strong>{reel.question}</strong><div className="muted">closing {reel.closing}{reel.folder ? ` · ${reel.folder}` : ""}{reel.reruns ? ` · redone ${reel.reruns}x` : ""}</div></div>
        <span className={`badge ${reel.state === "failed" ? "failed" : reel.state === "scheduled" ? "done" : reel.state === "review" ? "running" : ""}`}>{STATE_LABEL[reel.state]}</span>
      </div>
      {active && job && <div style={{ marginTop: 10 }}><ProgressBar job={job} /><div className="muted" style={{ marginTop: 4 }}>{job.step || "Waiting"} · {Math.round(job.progress * 100)}%</div></div>}
      {reel.state === "scheduled" && <p className="muted">Slot {reel.slot}{reel.offerDropped ? " · offer line left out of the Instagram copy" : ""}</p>}
      {(reel.error || err) && <p className="error">{reel.error ?? err}{reel.state === "failed" ? "" : ""}{err && reel.error ? ` ${err}` : ""}</p>}
      {reel.state === "review" && (
        <>
          <div className="review">
            {reel.mp4Url && <video className="player" src={reel.mp4Url} controls preload="metadata" poster={reel.coverUrl ?? undefined} />}
            <div className="grow">
              {reel.coverUrl && <img className="cover" src={reel.coverUrl} alt="Cover" />}
              <h3>Self-check</h3>
              <ul className="checks">{reel.checks.map((c) => <li key={c.label} className={c.ok ? "ok" : "bad"}>{c.ok ? "OK" : "Missing"} · {c.label}</li>)}</ul>
              {reel.selfCheck && <p className="muted">{reel.selfCheck}</p>}
            </div>
          </div>
          <h3>Caption</h3>
          <pre className="log mono caption">{reel.caption}</pre>
          {reel.note && <p className="muted">Your last note: {reel.note}</p>}
          {rejecting ? (
            <div>
              <label htmlFor={`note-${reel.ideaId}`}>What should change? ({reel.rerunsLeft} rerun{reel.rerunsLeft === 1 ? "" : "s"} left)</label>
              <textarea id={`note-${reel.ideaId}`} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn primary" disabled={busy || note.trim().length < 3 || reel.rerunsLeft === 0} onClick={() => void act(() => api.dailyReject(date, reel.ideaId, note))}>Reject and rerun</button>
                <button className="btn" disabled={busy} onClick={() => void act(() => api.dailyReject(date, reel.ideaId, note || "discarded", true))}>Discard this reel</button>
                <button className="btn" onClick={() => setRejecting(false)}>Back</button>
              </div>
            </div>
          ) : (
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn primary" disabled={busy} onClick={() => setSlot(true)}>Confirm</button>
              <button className="btn" disabled={busy} onClick={() => setRejecting(true)}>Reject</button>
            </div>
          )}
        </>
      )}
      {slot && <DailySlotDialog date={date} reel={reel} onClose={() => setSlot(false)} onDone={() => { setSlot(false); onChange(); }} />}
    </div>
  );
}
