import { useState } from "react";
import { zonedToUtc } from "../../src/slots";
import type { CalendarData, CalendarPost } from "../../src/shared/types";
import { api } from "../api";
import { Dialog } from "./Dialog";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const slotLabel = (date: string, time: string) => `${DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]} ${Number(date.slice(8))}/${date.slice(5, 7)} ${time}`;

export function CalendarPanel({ post, data, onClose, onDone }: { post: CalendarPost; data: CalendarData; onClose: () => void; onDone: (msg: string) => void }) {
  const [date, setDate] = useState(post.date);
  const [time, setTime] = useState(post.time);
  const [dialog, setDialog] = useState<"move" | "delete" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const real = post.status === "scheduled" && !post.busy;
  const inPattern = data.slots.some((s) => s.date === date && s.time === time);
  const taken = data.posts.some((p) => p.id !== post.id && p.date === date && p.time === time);
  const changed = date !== post.date || time !== post.time;
  const run = (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true); setErr(null);
    fn().then(() => { setDialog(null); onDone(msg); }).catch((e: Error) => { setErr(e.message); setBusy(false); });
  };
  return (
    <aside className="side" aria-label="Post details">
      <div className="row"><h1 className="grow" style={{ fontSize: 16 }}>{post.reel ? `Reel ${post.reel.n}` : "Post"}</h1><button className="btn small" onClick={onClose}>Close</button></div>
      {post.coverUrl && <img src={post.coverUrl} alt="" style={{ width: 90, borderRadius: 6, margin: "8px 0" }} />}
      <p style={{ margin: "6px 0" }}>{post.reel ? post.reel.name : "Not matched to a reel folder"}</p>
      <p className="muted" style={{ margin: "6px 0" }}>{slotLabel(post.date, post.time)} · {post.status === "scheduled" ? "scheduled on Instagram" : post.status}{post.reel?.closing ? ` · closing ${post.reel.closing}` : ""}</p>
      {post.reel && <p className="mono muted" style={{ margin: "6px 0" }}>reels/{post.reel.brand}/{post.reel.folder}</p>}
      <label>Caption starts with</label>
      <p style={{ margin: 0 }}>{post.captionStart || "Not available"}</p>
      {!real && <p className="muted">{post.busy ?? "This post can be changed once it is on Instagram and nothing else is pending."}</p>}
      {real && (
        <>
          <h2>Reschedule</h2>
          <div className="row">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="New date" />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="New time" />
          </div>
          {changed && date && time && <p className="muted" style={{ margin: "6px 0" }}>New slot: {slotLabel(date, time)}{inPattern ? "" : " (not one of your usual slots)"}{taken ? ". Another reel uses it." : ""}</p>}
          <p><button className="btn primary" disabled={!changed || !date || !time || taken || busy} onClick={() => setDialog("move")}>Reschedule</button></p>
          <h2>Delete</h2>
          <p><button className="btn" disabled={busy} onClick={() => setDialog("delete")}>Delete from Instagram</button></p>
        </>
      )}
      {err && <p className="error">{err}</p>}
      {dialog === "move" && (
        <Dialog title="Move this reel?" onClose={() => setDialog(null)}>
          <p>Move {post.reel ? `reel ${post.reel.n}` : "this post"} from {slotLabel(post.date, post.time)} to {slotLabel(date, time)}.</p>
          {err && <p className="error">{err}</p>}
          <div className="row"><button className="btn primary" disabled={busy} onClick={() => run(() => api.reschedule(post.id, zonedToUtc(date, time, data.timezone).toISOString()), "Reschedule started.")}>Move it</button><button className="btn" onClick={() => setDialog(null)}>Cancel</button></div>
        </Dialog>
      )}
      {dialog === "delete" && (
        <Dialog title="Delete this scheduled post?" onClose={() => setDialog(null)}>
          <p>This removes {post.reel ? `reel ${post.reel.n}` : "the post"} ({slotLabel(post.date, post.time)}) from Instagram's schedule. It cannot be undone. You can schedule the reel again later.</p>
          {err && <p className="error">{err}</p>}
          <div className="row"><button className="btn primary" disabled={busy} onClick={() => run(() => api.deletePost(post.id), "Delete started.")}>Delete post</button><button className="btn" onClick={() => setDialog(null)}>Keep it</button></div>
        </Dialog>
      )}
    </aside>
  );
}
