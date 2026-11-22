import { useCallback, useEffect, useRef, useState } from "react";
import { addDays, monthGrid, weekOf } from "../../src/shared/calendar-grid";
import type { CalendarData, CalendarPost, CalendarSlot, Job } from "../../src/shared/types";
import { api, getBrand } from "../api";
import { CalendarGrid } from "../components/CalendarGrid";
import { CalendarPanel, slotLabel } from "../components/CalendarPanel";
import { Dialog } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { ProgressBar } from "../components/JobCard";
import { ScheduleHere } from "../components/ScheduleHere";
import { SuggestTimes } from "../components/SuggestTimes";

const BROWSER = new Set(["instagram.schedule", "instagram.reschedule", "instagram.delete"]);
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "never");

export function CalendarPage({ jobs }: { jobs: Job[] }) {
  const [data, setData] = useState<CalendarData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"week" | "month">("week");
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<CalendarPost | null>(null);
  const [free, setFree] = useState<CalendarSlot | null>(null);
  const [drop, setDrop] = useState<{ post: CalendarPost; slot: CalendarSlot } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [dropErr, setDropErr] = useState<string | null>(null);

  const load = useCallback((fresh = false) => {
    setLoading(true);
    api.calendar(12, fresh).then((d) => { setData(d); setError(null); setCursor((c) => c ?? d.today); }).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);

  const browserJobs = jobs.filter((j) => BROWSER.has(j.type));
  const pending = browserJobs.filter((j) => j.status === "queued" || j.status === "running").length;
  const finished = browserJobs.filter((j) => j.status === "done" || j.status === "failed").length;
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } load(); }, [pending, finished, load]);

  const running = browserJobs.find((j) => j.status === "running");
  const active = cursor ?? data?.today ?? "";
  const step = (dir: number) => setCursor(view === "week" ? addDays(active, 7 * dir) : (() => { const d = new Date(`${active.slice(0, 7)}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + dir); return d.toISOString().slice(0, 10); })());
  const title = !active ? "" : view === "week" ? `${weekOf(active)[0]} to ${weekOf(active)[6]}` : new Date(`${active.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const logged = !!data?.checkedAt && !data.error;
  const needLogin = !!data?.error && /login/i.test(data.error);
  const done = (m: string) => { setNote(m); setSelected(null); setFree(null); setDrop(null); };

  const onDrop = (id: string, slot: CalendarSlot) => {
    const post = data?.posts.find((p) => p.id === id);
    if (post && post.status === "scheduled" && !post.busy) { setDropErr(null); setDrop({ post, slot }); }
  };
  const confirmDrop = () => {
    if (!drop) return;
    api.reschedule(drop.post.id, drop.slot.iso).then(() => done("Reschedule started.")).catch((e: Error) => setDropErr(e.message));
  };

  return (
    <>
      <h1>Calendar</h1>
      <p className="sub">What is scheduled on Instagram, and the free slots of your pattern. Times are {data?.timezone ?? "Europe/Rome"}.</p>
      <div className="cal-top">
        <div className="seg" role="group" aria-label="View">
          <button aria-pressed={view === "week"} onClick={() => setView("week")}>Week</button>
          <button aria-pressed={view === "month"} onClick={() => setView("month")}>Month</button>
        </div>
        <button className="btn small" onClick={() => step(-1)} aria-label="Previous">Prev</button>
        <strong>{title}</strong>
        <button className="btn small" onClick={() => step(1)} aria-label="Next">Next</button>
        <button className="btn small" onClick={() => setCursor(data?.today ?? null)}>Today</button>
        <span className="grow" />
        <span className="muted"><span className={`dot ${logged ? "ok" : needLogin ? "bad" : ""}`} />{logged ? "Instagram session active" : needLogin ? "Not logged in" : "Session unknown"} · <a href={`#/${getBrand()}/settings`}>Instagram login</a></span>
        <span className="muted">Checked {time(data?.checkedAt ?? null)}</span>
        <button className="btn" disabled={loading} onClick={() => load(true)}>{loading ? <><span className="spin" /> Reading</> : "Refresh from Instagram"}</button>
      </div>
      <SuggestTimes jobs={jobs} />
      {running && <div className="banner" role="status"><div className="row"><strong className="grow">{running.title}</strong><span className="muted">{running.step}</span></div><div style={{ marginTop: 8 }}><ProgressBar job={running} /></div></div>}
      {note && <p className="muted" role="status">{note}</p>}
      {error && <p className="error">{error}</p>}
      {data?.error && <p className="error">{data.stale ? "Showing the last reading. " : ""}{data.error}</p>}
      {data && data.posts.length === 0 && (
        <EmptyState title={needLogin ? "Log in to Instagram first" : "Nothing scheduled yet"} action={<><a className="btn" href={`#/${getBrand()}/settings`}>Settings</a><a className="btn" href={`#/${getBrand()}/factory`}>Factory</a></>}>
          {needLogin ? "The calendar reads this brand's own Instagram session. Open Settings, Instagram section, and log in once. " : "Free slots of the posting pattern are shown below. "}
          The first reel comes from the Factory: pick a question, make the reel, then schedule it here or from the Reels page.
        </EmptyState>
      )}
      {data?.stub && <p className="muted">The scheduler module is a stub: Instagram posts cannot be read yet.</p>}
      {data && cursor && (
        <div className="cal-layout">
          <div className="cal-main">
            <CalendarGrid data={data} view={view} cursor={cursor} selectedId={selected?.id ?? null} onSelect={setSelected} onFree={setFree} onDrop={onDrop} />
            {view === "month" && <p className="muted">{monthGrid(cursor).length} weeks shown. Click a day card for details.</p>}
          </div>
          {selected && <CalendarPanel key={selected.id} post={selected} data={data} onClose={() => setSelected(null)} onDone={done} />}
        </div>
      )}
      {free && data && <ScheduleHere slot={free} data={data} onClose={() => setFree(null)} onDone={done} />}
      {drop && (
        <Dialog title="Move this reel?" onClose={() => setDrop(null)}>
          <p>Move {drop.post.reel ? `reel ${drop.post.reel.n}` : "this post"} from {slotLabel(drop.post.date, drop.post.time)} to {slotLabel(drop.slot.date, drop.slot.time)}.</p>
          {dropErr && <p className="error">{dropErr}</p>}
          <div className="row"><button className="btn primary" onClick={confirmDrop}>Move it</button><button className="btn" onClick={() => setDrop(null)}>Cancel</button></div>
        </Dialog>
      )}
    </>
  );
}
