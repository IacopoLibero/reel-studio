import { useEffect, useState } from "react";
import type { Job } from "../../src/shared/types";
import { api, type SeriesData, type SeriesDraft, type SeriesItem } from "../api";
import { useLoad } from "../hooks";
import { ProgressBar } from "../components/JobCard";

const blank: SeriesDraft = { name: "", promise: "", cadence: "weekly", exampleHooks: [], questionIds: [] };
const active = (j: Job) => j.status === "queued" || j.status === "running";
interface Proposal extends SeriesDraft { why?: string; questions?: string[] }

function Editor({ item, data, onSave, onCancel }: { item: SeriesDraft & { id?: string }; data: SeriesData; onSave: (d: SeriesDraft) => void; onCancel: () => void }) {
  const [d, setD] = useState<SeriesDraft>(item);
  const [pickErr] = useState<string | null>(null);
  const taken = (qid: string) => data.badges[qid] && data.badges[qid]?.id !== item.id;
  const toggle = (qid: string) => setD({ ...d, questionIds: d.questionIds.includes(qid) ? d.questionIds.filter((x) => x !== qid) : [...d.questionIds, qid] });
  return (
    <div className="card">
      <label>Name</label><input type="text" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      <label>Promise (why someone follows)</label><input type="text" value={d.promise} onChange={(e) => setD({ ...d, promise: e.target.value })} />
      <label>Cadence</label><input type="text" value={d.cadence} onChange={(e) => setD({ ...d, cadence: e.target.value })} />
      <label>Example hooks (one per line)</label>
      <textarea rows={3} value={d.exampleHooks.join("\n")} onChange={(e) => setD({ ...d, exampleHooks: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 8) })} />
      <label>Questions in this series</label>
      <div className="qpick">
        {data.questions.map((q) => (
          <label key={q.id} className="chk"><input type="checkbox" checked={d.questionIds.includes(q.id)} onChange={() => toggle(q.id)} /> <span className={q.done ? "muted" : ""}>{q.question}</span>{taken(q.id) && <span className="badge">in {data.badges[q.id]?.name}</span>}</label>
        ))}
      </div>
      {pickErr && <p className="error">{pickErr}</p>}
      <div className="row" style={{ marginTop: 10 }}><button className="btn primary" disabled={d.name.trim().length < 2} onClick={() => onSave(d)}>Save</button><button className="btn" onClick={onCancel}>Cancel</button></div>
    </div>
  );
}

export function SeriesPage({ jobs }: { jobs: Job[] }) {
  const { data, error, reload } = useLoad(api.series);
  const [editing, setEditing] = useState<(SeriesDraft & { id?: string }) | null>(null);
  const [focus, setFocus] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const plans = jobs.filter((j) => j.type === "series.plan");
  const running = plans.find(active);
  const last = plans.find((j) => j.status === "done" && j.result.proposal);
  const doneCount = plans.filter((j) => j.status === "done").length;
  useEffect(reload, [doneCount]);
  const proposal = last?.result.proposal as Proposal | undefined;
  const fail = (e: Error) => setErr(e.message);

  const save = (d: SeriesDraft) => {
    const id = editing?.id;
    (id ? api.updateSeries(id, d) : api.createSeries(d)).then(() => { setEditing(null); setErr(null); reload(); }).catch(fail);
  };
  const accept = (p: Proposal) => api.createSeries({ name: p.name, promise: p.promise, cadence: p.cadence, exampleHooks: p.exampleHooks, questionIds: p.questionIds }).then(reload).catch(fail);
  const qText = (id: string) => data?.questions.find((q) => q.id === id)?.question ?? id;

  return (
    <>
      <h1>Series</h1>
      <p className="sub">Named recurring formats: a promise, a cadence, example hooks and the questions assigned to them. The Factory shows the series of each question.</p>
      <div className="card">
        <label style={{ marginTop: 0 }}>Plan a series (optional focus)</label>
        <div className="row"><input type="text" value={focus} maxLength={300} placeholder="for example: myths about menus" onChange={(e) => setFocus(e.target.value)} />
          <button className="btn primary" disabled={!!running} onClick={() => api.createJob("series.plan", focus.trim() ? { focus: focus.trim() } : {}).catch(fail)}>Plan a series</button></div>
        {running && <div style={{ marginTop: 10 }}><div className="muted">{running.step || "Waiting"}</div><ProgressBar job={running} /></div>}
      </div>
      {(err || error) && <p className="error">{err ?? error}</p>}
      {proposal && !running && (
        <div className="card suggest">
          <strong>Proposal: {proposal.name}</strong> <span className="muted">· {proposal.cadence}</span>
          <p>{proposal.promise}</p>
          {proposal.why && <p className="muted">{proposal.why}</p>}
          <div>{proposal.exampleHooks.map((h) => <span className="pill" key={h}>{h}</span>)}</div>
          {proposal.questions && proposal.questions.length > 0 && <p className="muted">Questions: {proposal.questions.join(" | ")}</p>}
          <div className="row"><button className="btn primary" onClick={() => accept(proposal)}>Add this series</button></div>
        </div>
      )}
      <div className="row" style={{ margin: "18px 0 8px" }}><h2 className="grow" style={{ margin: 0 }}>Your series</h2><button className="btn" onClick={() => setEditing(blank)}>New series</button></div>
      {editing && !editing.id && data && <Editor item={editing} data={data} onSave={save} onCancel={() => setEditing(null)} />}
      {data?.series.length === 0 && !editing && <p className="muted">No series yet. A series groups questions under one promise and rhythm. Add some questions in the Factory first, then group them here.</p>}
      {data?.series.map((s: SeriesItem) => editing?.id === s.id ? <Editor key={s.id} item={editing} data={data} onSave={save} onCancel={() => setEditing(null)} /> : (
        <div className="card" key={s.id}>
          <div className="row"><strong className="grow">{s.name}</strong><span className="muted">{s.cadence}</span>
            <button className="btn small" onClick={() => setEditing(s)}>Edit</button>
            <button className="btn small" onClick={() => { if (confirm(`Delete the series "${s.name}"?`)) api.deleteSeries(s.id).then(reload).catch(fail); }}>Delete</button></div>
          <p>{s.promise}</p>
          <div>{s.exampleHooks.map((h) => <span className="pill" key={h}>{h}</span>)}</div>
          {s.questionIds.length > 0 && <ul className="muted">{s.questionIds.map((q) => <li key={q}>{qText(q)}</li>)}</ul>}
        </div>
      ))}
    </>
  );
}
