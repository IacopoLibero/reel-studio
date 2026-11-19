import { useEffect, useMemo, useState } from "react";
import type { FactoryQuestion, Job } from "../../src/shared/types";
import { api, getBrand } from "../api";
import { useLoad } from "../hooks";
import { JobCard } from "../components/JobCard";
import { IdeasPanel } from "../components/IdeasPanel";
import { EmptyState } from "../components/EmptyState";

type Closing = "A" | "B";

export function FactoryPage({ jobs }: { jobs: Job[] }) {
  const { data, error, reload } = useLoad(api.questions);
  const { data: badges } = useLoad(api.seriesBadges);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [override, setOverride] = useState<Readonly<Record<string, Closing>>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const makeJobs = jobs.filter((j) => j.type === "reel.make");
  const activeKey = makeJobs.filter((j) => j.status === "queued" || j.status === "running").length;
  const doneKey = makeJobs.filter((j) => j.status === "done").length;
  useEffect(reload, [activeKey, doneKey]);
  const ideaJobs = jobs.filter((j) => j.type === "reel.ideas");

  const qs = data ?? [];
  const todo = qs.filter((q) => !q.done);
  const sections = useMemo(() => {
    const m = new Map<string, FactoryQuestion[]>();
    for (const q of todo) m.set(q.section, [...(m.get(q.section) ?? []), q]);
    return [...m.entries()];
  }, [data]);
  const closingOf = (q: FactoryQuestion): Closing => override[q.id] ?? q.autoClosing;
  const selectable = (q: FactoryQuestion) => !q.making;
  const chosen = todo.filter((q) => picked.has(q.id) && selectable(q));
  const a = chosen.filter((q) => closingOf(q) === "A").length;

  const toggle = (ids: string[], on: boolean) => setPicked((cur) => { const n = new Set(cur); ids.forEach((i) => (on ? n.add(i) : n.delete(i))); return n; });
  const send = async () => {
    setBusy(true); setMsg(null);
    const results = await Promise.allSettled(chosen.map((q) => api.createJob("reel.make", { questionId: q.id, closing: closingOf(q) })));
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    setMsg(`${results.length - failed.length} sent to the factory.${failed.length ? ` ${failed.length} refused: ${(failed[0]?.reason as Error).message}` : ""}`);
    setPicked(new Set()); setBusy(false); reload();
  };

  return (
    <>
      <h1>Factory</h1>
      <p className="sub">Questions from reel-questions.md. Pick some, choose the closing, and send them to be made.</p>
      {error && <p className="error">{error}</p>}
      <p className="muted">{qs.length} questions: {qs.length - todo.length} done, {todo.length} to do.</p>

      {data && qs.length === 0 && (
        <EmptyState title="No questions yet. Start here.">
          A reel is made from a question: the opening line of the video. This brand's list is empty. Press &ldquo;Find new ideas&rdquo; below and accept the ones you like, or write your own questions in <span className="mono">brand/{getBrand()}/reel-questions.md</span> (one line each, under &ldquo;To do&rdquo;). Then pick a question here and send it to the factory.
        </EmptyState>
      )}

      <IdeasPanel jobs={ideaJobs} onAdded={reload} />

      {qs.length > 0 && <h2>To do</h2>}
      {qs.length > 0 && <table className="q"><thead><tr><th /><th>Question</th><th>Hook</th><th>Source</th><th>Closing</th></tr></thead>
        <tbody>
          {sections.map(([name, items]) => {
            const ids = items.filter(selectable).map((q) => q.id);
            const all = ids.length > 0 && ids.every((i) => picked.has(i));
            return [
              <tr className="sec" key={`s-${name}`}><td><input type="checkbox" checked={all} onChange={(e) => toggle(ids, e.target.checked)} aria-label={`Select all in ${name}`} /></td><td colSpan={4}>{name}</td></tr>,
              ...items.map((q) => (
                <tr key={q.id}>
                  <td><input type="checkbox" disabled={!selectable(q)} checked={picked.has(q.id)} onChange={(e) => toggle([q.id], e.target.checked)} /></td>
                  <td>{q.question}{badges?.[q.id] && <a className="badge" href="#/series" style={{ marginLeft: 8 }}>{badges[q.id]?.name}</a>}{q.making && <span className="badge running" style={{ marginLeft: 8 }}>in the factory</span>}</td>
                  <td className="muted">{q.hook ?? ""}</td>
                  <td className="muted">{q.sourceKind === "needs-source" ? "needs source" : q.source ?? "none"}</td>
                  <td>
                    <select value={closingOf(q)} onChange={(e) => setOverride({ ...override, [q.id]: e.target.value as Closing })}>
                      <option value="A">A: Offer and website</option><option value="B">B: Follow for tips</option>
                    </select>
                    {override[q.id] && override[q.id] !== q.autoClosing && <span className="muted"> (auto: {q.autoClosing})</span>}
                  </td>
                </tr>
              )),
            ];
          })}
        </tbody>
      </table>}
      {qs.length > 0 && <div className="summary row wrap">
        <div className="grow">{chosen.length === 0 ? "Nothing selected." : `${chosen.length} reel${chosen.length > 1 ? "s" : ""} will be made: ${a} with closing A, ${chosen.length - a} with closing B.`} {msg && <span className="muted">{msg}</span>}</div>
        <button className="btn primary" disabled={!chosen.length || busy} onClick={send}>Send to factory</button>
      </div>}

      {makeJobs.length > 0 && <h2>In the factory</h2>}
      {makeJobs.slice(0, 12).map((j) => <JobCard key={j.id} job={j} open={j.status === "running"} />)}

      {qs.some((q) => q.done) && <h2>Done</h2>}
      {qs.some((q) => q.done) && <table className="q"><thead><tr><th>Question</th><th>Folder</th><th>Closing</th><th>Files</th><th>Instagram</th></tr></thead>
        <tbody>
          {qs.filter((q) => q.done).map((q) => (
            <tr className="done" key={q.id}>
              <td>{q.question}</td>
              <td className="mono">{q.folder ?? ""}</td>
              <td>{q.closing ? <span className="badge">{q.closing}</span> : ""}</td>
              <td>{q.reel ? [q.reel.hasMp4 && "MP4", q.reel.hasCaption && "caption", q.reel.hasCover && "cover"].filter(Boolean).join(", ") || "empty" : "folder missing"}</td>
              <td>{q.reel?.schedule ? `Scheduled ${q.reel.schedule.at}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>}
    </>
  );
}
