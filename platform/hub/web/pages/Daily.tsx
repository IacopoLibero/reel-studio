import { useEffect, useMemo, useState } from "react";
import type { DailyIdeaData, DailyPlanData, DailyViewData, PlanStatus } from "../../src/shared/daily";
import { api } from "../api";
import { useLoad } from "../hooks";
import { ProgressBar } from "../components/JobCard";
import { ReelCard } from "../components/DailyReview";

const PIPE = ["Collect", "Analyse", "Ideas", "Waiting for you", "Creating", "Waiting for review", "Scheduled"] as const;
const POS: Record<PlanStatus, number> = { collecting: 0, analysing: 1, ideas: 2, awaiting_approval: 3, creating: 4, awaiting_review: 5, scheduling: 5, done: 6, skipped: 3, failed: 0 };
const STOP = new Set<PlanStatus>(["done", "skipped", "failed"]);

function Pipeline({ plan }: { plan: DailyPlanData }) {
  const at = POS[plan.status];
  return (
    <div className="pipe" role="list">
      {PIPE.map((label, i) => {
        const cls = plan.status === "failed" && i === at ? "bad" : plan.status === "done" || i < at ? "past" : i === at && plan.status !== "skipped" ? "now" : "";
        return <div key={label} role="listitem" className={`pipe-step ${cls}`}><span className="n">{i + 1}</span>{label}</div>;
      })}
    </div>
  );
}

function Ideas({ view, onChange }: { view: DailyViewData; onChange: () => void }) {
  const plan = view.plan as DailyPlanData;
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set(plan.ideas.map((i) => i.id)));
  const [closing, setClosing] = useState<Readonly<Record<string, "A" | "B">>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const waiting = plan.status === "awaiting_approval";
  const closeOf = (i: DailyIdeaData) => closing[i.id] ?? i.closing;
  const chosen = plan.ideas.filter((i) => picked.has(i.id));
  const toggle = (id: string, on: boolean) => setPicked((cur) => { const n = new Set(cur); if (on) n.add(id); else n.delete(id); return n; });
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setErr(null); try { await fn(); onChange(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  return (
    <>
      <h2>The {plan.ideas.length} ideas</h2>
      {plan.ideas.map((i) => (
        <div className="card idea-card" key={i.id}>
          <div className="row" style={{ alignItems: "flex-start" }}>
            {waiting && <input type="checkbox" aria-label={`Select: ${i.question}`} checked={picked.has(i.id)} onChange={(e) => toggle(i.id, e.target.checked)} />}
            <div className="grow">
              <div className="q-text">{i.question}</div>
              <div className="muted">hook: {i.hook} · source: {i.source}</div>
              <div className="why">{i.basedOnData}</div>
              <div className="muted">why: {i.why}</div>
              {i.threads && <details><summary className="muted">Threads text (not posted)</summary><p className="threads">{i.threads}</p></details>}
            </div>
            <div className="closing">
              <label htmlFor={`c-${i.id}`}>Closing</label>
              <select id={`c-${i.id}`} disabled={!waiting} value={closeOf(i)} onChange={(e) => setClosing({ ...closing, [i.id]: e.target.value as "A" | "B" })}>
                <option value="A">A: Offer and website</option><option value="B">B: Follow for tips</option>
              </select>
            </div>
          </div>
        </div>
      ))}
      {err && <p className="error">{err}</p>}
      {waiting && (
        <div className="summary row wrap">
          <div className="grow">{chosen.length === 0 ? "Nothing selected." : `${chosen.length} reel${chosen.length > 1 ? "s" : ""} will be made. Nothing is created before you click.`}</div>
          <button className="btn" disabled={busy} onClick={() => void run(() => api.dailySkip(view.date))}>Skip today</button>
          <button className="btn primary" disabled={busy || !chosen.length} onClick={() => void run(() => api.dailyApprove(view.date, chosen.map((i) => ({ ideaId: i.id, closing: closeOf(i) }))))}>Create selected</button>
        </div>
      )}
    </>
  );
}

export function DailyPage({ jobs }: { jobs: { status: string; progress: number; type: string }[] }) {
  const [date, setDate] = useState<string | undefined>(undefined);
  const { data, error, reload } = useLoad(() => api.daily(date), [date]);
  const watched = jobs.filter((j) => ["daily.run", "reel.make", "instagram.schedule"].includes(j.type)).map((j) => `${j.status}${Math.round(j.progress * 20)}`).join(",");
  useEffect(reload, [watched]);
  const plan = data?.plan ?? null;
  const running = !!plan && !STOP.has(plan.status) && plan.status !== "awaiting_approval" && plan.status !== "awaiting_review";
  useEffect(() => { if (!running) return; const t = setInterval(reload, 4000); return () => clearInterval(t); }, [running, reload]);
  const [msg, setMsg] = useState<string | null>(null);
  const start = () => { setMsg(null); api.dailyRun().then(reload).catch((e: Error) => setMsg(e.message)); };
  const proposals = useMemo(() => plan?.proposals ?? [], [plan]);

  if (!data) return <>{error ? <p className="error">{error}</p> : <p className="muted">Loading</p>}</>;
  return (
    <>
      <div className="row wrap"><div className="grow"><h1>Daily</h1><p className="sub">Each day: collect, analyse, three ideas, then you decide. Nothing is made before "Create selected" and nothing is scheduled before "Confirm".</p></div>
        {data.dates.length > 1 && <select style={{ width: 200 }} value={data.date} onChange={(e) => setDate(e.target.value)} aria-label="Day">{data.dates.map((d) => <option key={d} value={d}>{d}{d === data.today ? " (today)" : ""}</option>)}</select>}
      </div>
      <p className="muted">Daily loop: {data.settings.enabled ? `on, from ${data.settings.earliest} (Rome time)` : "off (switch it on in Settings)"}.</p>
      {!plan && (
        <div className="card"><p>No plan for {data.date}.</p><p className="muted">Each day the loop reads this brand's numbers and proposes ideas. A new brand has no numbers yet, so make a first reel or two in the Factory, then run it. Switch the automatic run on in Settings when you want it.</p>{data.date === data.today && <button className="btn primary" onClick={start}>Run today's analysis now</button>}{msg && <p className="error">{msg}</p>}</div>
      )}
      {plan && (
        <>
          <Pipeline plan={plan} />
          {plan.status === "skipped" && <p className="muted">Skipped: nothing was created.</p>}
          {plan.status === "failed" && <div className="card"><p className="error">{plan.error ?? "The daily run failed."}</p>{data.date === data.today && <button className="btn primary" onClick={start}>Run again</button>}{msg && <p className="error">{msg}</p>}</div>}
          {running && data.job && <div className="card"><div className="row"><strong className="grow">{data.job.step || "Starting"}</strong><span className="muted">{Math.round(data.job.progress * 100)}%</span></div><div style={{ marginTop: 8 }}><ProgressBar job={data.job} /></div></div>}
          {plan.warnings.map((w) => <p className="warnline" key={w}>{w}</p>)}
          {plan.collect && <p className="muted">Data: {plan.collect.note}</p>}
          {plan.skillsUsed.length > 0 && <p className="muted">Skills used: {plan.skillsUsed.join(", ")}{plan.skillsMissing.length ? ` · not called: ${plan.skillsMissing.join(", ")}` : ""}</p>}

          {plan.readout && (
            <>
              <h2>Readout</h2>
              <div className="card readout">
                <p>{plan.readout.text}</p>
                <div className="cols">
                  <div><h3>Repeat</h3>{plan.readout.repeat.map((x) => <p className="li" key={x}>{x}</p>)}</div>
                  <div><h3>Stop</h3>{plan.readout.stop.map((x) => <p className="li" key={x}>{x}</p>)}</div>
                  <div><h3>Hooks that worked</h3>{plan.readout.hookPatterns.map((x) => <p className="li" key={x}>{x}</p>)}</div>
                </div>
                {plan.readout.bestTimes.length > 0 && <p className="muted">Best times: {plan.readout.bestTimes.join(", ")}</p>}
              </div>
            </>
          )}
          {proposals.length > 0 && (
            <>
              <h2>Proposals to improve</h2>
              <p className="muted" style={{ marginTop: 0 }}>Only shown, never applied by the hub. Ask Claude to apply one if you agree.</p>
              {proposals.map((p) => <div className="card" key={p.id}><strong>{p.title}</strong>{p.target && <span className="muted mono"> · {p.target}</span>}<p style={{ margin: "6px 0" }}>{p.change}</p>{p.why && <div className="muted">{p.why}</div>}</div>)}
            </>
          )}
          {plan.ideas.length > 0 && data.reels.length === 0 && <Ideas key={`${plan.date}-${plan.status}`} view={data} onChange={reload} />}
          {data.reels.length > 0 && (
            <>
              <h2>Reels</h2>
              {data.reels.map((r) => <ReelCard key={r.ideaId} date={data.date} reel={r} onChange={reload} />)}
            </>
          )}
        </>
      )}
    </>
  );
}
