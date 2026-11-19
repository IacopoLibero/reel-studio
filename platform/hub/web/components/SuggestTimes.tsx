import { useEffect } from "react";
import type { Job } from "../../src/shared/types";
import { api } from "../api";
import { useLoad } from "../hooks";
import { ProgressBar } from "./JobCard";
import { useState } from "react";

/** "Suggest best times": computed by the schedule.suggest job from the real analytics; the slot pattern is never changed. */
export function SuggestTimes({ jobs }: { jobs: Job[] }) {
  const { data, error, reload } = useLoad(api.suggestions);
  const [err, setErr] = useState<string | null>(null);
  const mine = jobs.filter((j) => j.type === "schedule.suggest");
  const running = mine.find((j) => j.status === "queued" || j.status === "running");
  const failed = mine[0]?.status === "failed" ? mine[0] : null;
  const done = mine.filter((j) => j.status === "done").length;
  useEffect(reload, [done]);
  const [open, setOpen] = useState(false);
  return (
    <div className="card suggest">
      <div className="row">
        <strong className="grow">Best posting times</strong>
        <button className="btn" disabled={!!running} onClick={() => { setErr(null); setOpen(true); api.createJob("schedule.suggest", {}).catch((e: Error) => setErr(e.message)); }}>Suggest best times</button>
        {data?.at && <button className="btn small" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"}</button>}
      </div>
      {running && <div style={{ marginTop: 8 }}><div className="muted">{running.step || "Waiting"}</div><ProgressBar job={running} /></div>}
      {(err || error) && <p className="error">{err ?? error}</p>}
      {failed && !running && <p className="error">Last try failed: {failed.error}</p>}
      {open && data?.at && (
        <div style={{ marginTop: 8 }}>
          <p className={data.enough ? "" : "muted"}>{data.message}</p>
          {data.enough ? <>
            {data.suggestions.map((s) => <p key={`${s.day}${s.time}`}><span className="pill">{s.day} {s.time}</span>{s.why}</p>)}
            {data.basedOn && <p className="muted">{data.basedOn}</p>}{data.note && <p className="muted">{data.note}</p>}
          </> : <div>{data.defaults.map((d) => <span className="pill" key={d.day}>{d.day} {d.times.join(", ")}</span>)}</div>}
          <p className="muted">Only a suggestion: the slot pattern in Settings is unchanged.</p>
        </div>
      )}
    </div>
  );
}
