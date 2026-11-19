import { useState } from "react";
import type { Job } from "../../src/shared/types";
import { api } from "../api";

export function ProgressBar({ job }: { job: Pick<Job, "progress" | "status"> }) {
  return <div className={`bar ${job.status}`}><i style={{ width: `${Math.round(job.progress * 100)}%` }} /></div>;
}

const time = (s: string | null) => (s ? new Date(s).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "");

export function JobCard({ job, open: initial = false }: { job: Job; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const active = job.status === "running" || job.status === "queued";
  const cancel = () => api.cancelJob(job.id).catch((e: Error) => setErr(e.message));
  return (
    <div className="card">
      <div className="row">
        <div className="grow">
          <div><strong>{job.title}</strong> <span className="muted">· {job.type}</span></div>
          <div className="muted">{active ? job.step || "Waiting" : time(job.finishedAt ?? job.createdAt)}</div>
        </div>
        <span className={`badge ${job.status}`}>{job.status}</span>
        <button className="btn small" onClick={() => setOpen(!open)}>{open ? "Hide log" : "Log"}</button>
        {active && <button className="btn small" onClick={cancel}>Cancel</button>}
      </div>
      <div style={{ marginTop: 10 }}><ProgressBar job={job} /></div>
      {job.steps.length > 1 && active && <div className="muted" style={{ marginTop: 6 }}>Step {job.stepIndex + 1} of {job.steps.length}</div>}
      {job.error && <p className="error">{job.error}</p>}
      {err && <p className="error">{err}</p>}
      {job.status === "done" && typeof job.result.summary === "string" && <p className="muted">{job.result.summary.slice(0, 400)}</p>}
      {open && <pre className="log mono">{job.log.slice(-60).join("\n") || "No log yet."}</pre>}
    </div>
  );
}
