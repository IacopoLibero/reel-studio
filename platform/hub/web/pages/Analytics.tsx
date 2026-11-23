import { useEffect, useMemo, useState } from "react";
import type { MediaRecord, Metrics } from "../../src/analytics/schemas";
import type { Job } from "../../src/shared/types";
import { api } from "../api";
import { useLoad } from "../hooks";
import { PlaysChart } from "../components/AnalyticsChart";
import { ReelsTable } from "../components/AnalyticsTable";
import { ProgressBar } from "../components/JobCard";

const active = (j: Job) => j.status === "queued" || j.status === "running";

function best(reels: MediaRecord[], k: keyof Metrics, worst = false): MediaRecord | null {
  const withValue = reels.filter((r) => typeof r.metrics[k] === "number");
  if (withValue.length === 0) return null;
  return withValue.reduce((a, b) => ((b.metrics[k] as number) > (a.metrics[k] as number)) !== worst ? b : a);
}

function Card({ title, reel, k }: { title: string; reel: MediaRecord | null; k: keyof Metrics }) {
  return (
    <div className="card stat">
      <div className="muted">{title}</div>
      <div className="big">{reel ? reel.metrics[k] : "n/a"}</div>
      <div className="clip">{reel ? `${reel.reel ? `#${reel.reel.n} ` : ""}${reel.hook || reel.captionStart}` : "no data yet"}</div>
    </div>
  );
}

/** Minimal Markdown: headings, bullets, **bold**. Text is rendered by React, never as HTML. */
function Readout({ md }: { md: string }) {
  const bold = (t: string) => t.split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : p));
  return <div className="readout">{md.split("\n").filter((l) => l.trim()).map((l, i) => (/^\s*[-*] /.test(l) ? <p key={i} className="li">{bold(l.replace(/^\s*[-*] /, ""))}</p> : /^#+ /.test(l) ? <h3 key={i}>{l.replace(/^#+ /, "")}</h3> : <p key={i}>{bold(l)}</p>))}</div>;
}

export function AnalyticsPage({ jobs }: { jobs: Job[] }) {
  const { data, error, reload } = useLoad(api.analytics);
  const [err, setErr] = useState<string | null>(null);
  const mine = jobs.filter((j) => j.type === "analytics.collect" || j.type === "reel.insights");
  const doneCount = mine.filter((j) => j.status === "done").length;
  useEffect(reload, [doneCount]);
  const running = mine.find(active);
  // "Failed in the last hour" is read on every render on purpose.
  // oxlint-disable-next-line react/purity
  const failed = mine.find((j) => j.status === "failed" && Date.parse(j.finishedAt ?? "") > Date.now() - 3600_000);
  const reels = data?.reels ?? [];
  const cards = useMemo(() => ({ plays: best(reels, "plays"), worst: best(reels, "plays", true), saves: best(reels, "saves"), shares: best(reels, "shares") }), [data]);
  const start = (type: "analytics.collect" | "reel.insights") => { setErr(null); api.createJob(type, {}).catch((e: Error) => setErr(e.message)); };

  return (
    <>
      <h1>Analytics</h1>
      <p className="sub">Results of the reels on Instagram, read-only. {data?.collectedAt ? `Last reading ${new Date(data.collectedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.` : "No reading yet."}</p>
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <button className="btn primary" disabled={!!running} onClick={() => start("analytics.collect")}>Refresh from Instagram</button>
        <button className="btn" disabled={!!running || !data?.collectedAt} onClick={() => start("reel.insights")}>Write the readout</button>
      </div>
      {running && <div className="banner"><div className="row"><strong className="grow">{running.title}</strong><span className="muted">{running.step}</span></div><div style={{ marginTop: 8 }}><ProgressBar job={running} /></div></div>}
      {(err || error) && <p className="error">{err ?? error}</p>}
      {failed && !running && <p className="error">{failed.title} failed: {failed.error}</p>}
      {data?.warnings.map((w) => <p key={w} className="muted">{w}</p>)}
      {reels.length === 0 && !running && <p className="muted">No reels read yet. Log in to this brand's Instagram first (Settings), then press Refresh from Instagram. Numbers appear after the first reel is published.</p>}
      {reels.length > 0 && (
        <>
          <div className="stats">
            <Card title="Most plays" reel={cards.plays} k="plays" />
            <Card title="Fewest plays" reel={cards.worst} k="plays" />
            <Card title="Most saves" reel={cards.saves} k="saves" />
            <Card title="Most shares" reel={cards.shares} k="shares" />
          </div>
          <h2>Plays per reel</h2>
          <div className="card"><PlaysChart reels={reels} /><div className="muted">Bars: plays. Green line: reach.</div></div>
          <h2>All reels</h2>
          <ReelsTable reels={reels} />
        </>
      )}
      <h2>Plain-language readout</h2>
      <div className="card">
        {data?.readout ? <><div className="muted" style={{ marginBottom: 8 }}>Written on {data.readout.date}</div><Readout md={data.readout.markdown} /></> : <p className="muted">No readout yet. Read the results first, then press Write the readout.</p>}
      </div>
    </>
  );
}
