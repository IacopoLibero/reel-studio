import { useEffect, useState } from "react";
import type { IdeaBatchView, Job } from "../../src/shared/types";
import { api } from "../api";
import { useLoad } from "../hooks";
import { JobCard } from "./JobCard";

type Choice = "accept" | "reject";

export function IdeasPanel({ jobs, onAdded }: { jobs: Job[]; onAdded: () => void }) {
  const { data, reload } = useLoad(api.ideas);
  const [count, setCount] = useState(10);
  const [choice, setChoice] = useState<Readonly<Record<string, Choice>>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = jobs.filter((j) => j.status === "queued" || j.status === "running");
  const latest = jobs[0];
  const doneKey = jobs.filter((j) => j.status === "done").length;
  useEffect(reload, [doneKey]);

  const find = async () => {
    setBusy(true); setMsg(null);
    try { await api.createJob("reel.ideas", { count }); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const pick = (id: string, c: Choice, on: boolean) => setChoice((cur) => { const n = { ...cur }; if (on) n[id] = c; else delete n[id]; return n; });
  const resolve = async (b: IdeaBatchView) => {
    const ids = (c: Choice) => b.ideas.filter((i) => choice[i.id] === c).map((i) => i.id);
    setBusy(true); setMsg(null);
    try {
      const r = await api.resolveIdeas(b.id, ids("accept"), ids("reject"));
      setMsg(`${r.added.length} added to To do, ${r.rejected} rejected${r.skipped.length ? `, ${r.skipped.length} skipped as duplicates` : ""}.`);
      reload(); onAdded();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
      <h2>New ideas</h2>
      <div className="row wrap">
        <label style={{ margin: 0 }} htmlFor="idea-count">How many (1 to 30)</label>
        <input id="idea-count" type="number" min={1} max={30} value={count} style={{ width: 80 }} onChange={(e) => setCount(Math.max(1, Math.min(30, Number(e.target.value) || 10)))} />
        <button className="btn primary" disabled={busy || active.length > 0} onClick={() => void find()}>Find new ideas</button>
        {msg && <span className="muted">{msg}</span>}
      </div>
      {latest && (active.length > 0 || latest.status === "failed") && <div style={{ marginTop: 12 }}><JobCard job={latest} open={latest.status === "running"} /></div>}

      {(data ?? []).map((b) => {
        const chosen = b.ideas.filter((i) => choice[i.id]).length;
        return (
          <div className="card" key={b.id} style={{ marginTop: 12 }}>
            <div className="row"><strong className="grow">Proposed ideas</strong><span className="muted">{b.ideas.length} waiting{b.dropped ? `, ${b.dropped} repeats dropped` : ""}</span></div>
            {b.skillsUsed.length === 0
              ? <p className="error" style={{ margin: "4px 0" }}>Warning: no content skill was used for this batch.</p>
              : <p className="muted" style={{ margin: "4px 0" }}>Skills used: {b.skillsUsed.join(", ")}</p>}
            {b.notes.map((n) => <p className="muted" key={n} style={{ margin: "4px 0" }}>{n}</p>)}
            {b.ideas.map((i) => (
              <div className={`idea${i.duplicate ? " dup" : ""}`} key={i.id}>
                <div className="grow">
                  <div>{i.question}</div>
                  <div className="muted">hook: {i.hook} · source: {i.source} · closing {i.closing}{i.duplicate ? " · already in the list" : ""}</div>
                  <div className="muted">why: {i.why}</div>
                  <div className="muted">source supports: {i.sourceSupports}</div>
                </div>
                <label className="pick"><input type="checkbox" disabled={i.duplicate} checked={choice[i.id] === "accept"} onChange={(e) => pick(i.id, "accept", e.target.checked)} />Accept</label>
                <label className="pick"><input type="checkbox" checked={choice[i.id] === "reject"} onChange={(e) => pick(i.id, "reject", e.target.checked)} />Reject</label>
              </div>
            ))}
            <div className="row" style={{ marginTop: 10 }}>
              <span className="muted grow">{chosen} chosen</span>
              <button className="btn primary" disabled={busy || chosen === 0} onClick={() => void resolve(b)}>Add accepted to To do</button>
            </div>
          </div>
        );
      })}
    </>
  );
}
