import { useState } from "react";
import type { Reel } from "../../src/shared/types";
import { api } from "../api";
import { useLoad } from "../hooks";

export function SlotPicker({ reel, onClose }: { reel: Reel; onClose: () => void }) {
  const { data, error } = useLoad(() => api.slots(21));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = (date: string, time: string) => {
    setBusy(true);
    api.createJob("instagram.schedule", { reel: reel.key, date, time }).then(onClose).catch((e: Error) => { setErr(e.message); setBusy(false); });
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h1>Schedule reel {reel.n}</h1>
        <p className="sub">{reel.name}. Pick a slot from your pattern.</p>
        {(error || err) && <p className="error">{error ?? err}</p>}
        {!data && !error && <p className="muted">Loading slots</p>}
        {data?.map((s) => (
          <button key={s.iso} className="btn slot" disabled={s.taken || busy} onClick={() => pick(s.date, s.time)}>
            <span>{s.label}</span><span className="muted">{s.taken ? "taken" : ""}</span>
          </button>
        ))}
        <p><button className="btn" onClick={onClose}>Close</button></p>
      </div>
    </div>
  );
}
