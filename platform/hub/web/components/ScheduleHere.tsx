import { useState } from "react";
import type { CalendarData, CalendarSlot } from "../../src/shared/types";
import { api } from "../api";
import { useLoad } from "../hooks";
import { Dialog } from "./Dialog";
import { slotLabel } from "./CalendarPanel";

/** Picker of finished, unscheduled reels for one free slot; creates the usual instagram.schedule job. */
export function ScheduleHere({ slot, data, onClose, onDone }: { slot: CalendarSlot; data: CalendarData; onClose: () => void; onDone: (m: string) => void }) {
  const { data: reels, error } = useLoad(api.reels);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onCalendar = new Set(data.posts.map((p) => p.reel?.key).filter(Boolean));
  const choices = (reels ?? []).filter((r) => r.mp4 && r.hasCaption && r.hasCover && !r.schedule && !r.scheduling && !onCalendar.has(r.key)).reverse();
  const pick = (key: string) => {
    setBusy(true);
    api.createJob("instagram.schedule", { reel: key, date: slot.date, time: slot.time }).then(() => onDone("Scheduling started.")).catch((e: Error) => { setErr(e.message); setBusy(false); });
  };
  return (
    <Dialog title={`Schedule for ${slotLabel(slot.date, slot.time)}`} onClose={onClose}>
      {(error || err) && <p className="error">{error ?? err}</p>}
      {!reels && !error && <p className="muted">Loading reels</p>}
      {reels && choices.length === 0 && <p className="muted">Every finished reel is already scheduled.</p>}
      {choices.map((r) => (
        <button key={r.key} className="btn slot" disabled={busy} onClick={() => pick(r.key)}><span>{r.n} · {r.name}</span><span className="muted">{r.captionStart.slice(0, 30)}</span></button>
      ))}
      <p><button className="btn" onClick={onClose}>Close</button></p>
    </Dialog>
  );
}
