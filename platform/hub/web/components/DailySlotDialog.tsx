import { useState } from "react";
import type { DailyReelData } from "../../src/shared/daily";
import { api, ApiError } from "../api";
import { useLoad } from "../hooks";
import { Dialog } from "./Dialog";

/** Slot dialog: the next free slot of the pattern is proposed (best time first); the user can change it. Confirm creates the schedule job. */
export function DailySlotDialog({ date, reel, onClose, onDone }: { date: string; reel: DailyReelData; onClose: () => void; onDone: () => void }) {
  const { data, error } = useLoad(() => api.dailySlots(date, reel.ideaId));
  const [picked, setPicked] = useState<string | null>(null);
  const [drop, setDrop] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const slots = data?.slots ?? [];
  const cur = slots.find((s) => `${s.date} ${s.time}` === (picked ?? (data?.recommended ? `${data.recommended.date} ${data.recommended.time}` : ""))) ?? null;
  const offerHit = !!cur && cur.offerExpired && reel.closing === "A" && (data?.offerLines.length ?? 0) > 0;

  const confirm = async () => {
    if (!cur) return;
    setBusy(true); setErr(null);
    try { await api.dailyConfirm(date, reel.ideaId, cur.date, cur.time, drop); onDone(); } catch (e) {
      setErr((e as Error).message);
      if (e instanceof ApiError && e.status === 409) setBusy(false);
      else setBusy(false);
    }
  };
  return (
    <Dialog title="Choose the slot" onClose={onClose}>
      <p className="sub">{reel.question}</p>
      {(error || err) && <p className="error">{error ?? err}</p>}
      {!data && !error && <p className="muted">Loading slots</p>}
      {data?.recommended && <p className="suggest">Suggested: <strong>{data.recommended.label}</strong>{data.bestTimeNote ? <span className="muted"> {data.bestTimeNote}</span> : null}</p>}
      <div className="slotgrid">
        {slots.map((s) => {
          const key = `${s.date} ${s.time}`;
          const on = cur ? key === `${cur.date} ${cur.time}` : false;
          return <button key={key} className={`btn slot${on ? " primary" : ""}`} disabled={s.taken || busy} onClick={() => { setPicked(key); setDrop(false); }}><span>{s.label}</span><span className="muted">{s.taken ? "taken" : s.offerExpired && reel.closing === "A" ? "after offer" : ""}</span></button>;
        })}
      </div>
      {offerHit && (
        <div className="card warn">
          <strong>The offer has ended.</strong>
          <p className="muted" style={{ margin: "4px 0" }}>The offer ended before this slot and this caption still shows it. caption.md is not changed.</p>
          <pre className="log mono">{data?.offerLines.join("\n")}</pre>
          <label className="chk"><input type="checkbox" checked={drop} onChange={(e) => setDrop(e.target.checked)} />Send Instagram a copy of the caption without the 🎁 line</label>
        </div>
      )}
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn primary" disabled={!cur || busy || (offerHit && !drop)} onClick={() => void confirm()}>Confirm {cur ? cur.label : ""}</button>
        <button className="btn" onClick={onClose}>Close</button>
      </div>
    </Dialog>
  );
}
