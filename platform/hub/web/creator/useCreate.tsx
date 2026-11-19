import { useEffect, useRef, useState } from "react";
import type { Job } from "../../src/shared/types";
import { api, type CreateRequest } from "../api";
import { JobCard } from "../components/JobCard";

export interface Created { slug: string; steps: string[]; character: string }

/** Sends one create request and follows its brand.create job (SSE with a poll as backup) until it ends. */
export function useCreate(onCreated: (c: Created) => void) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    if (!job || job.status === "done" || job.status === "failed" || job.status === "cancelled") return;
    const es = new EventSource("/api/events");
    es.addEventListener("job", (ev) => { const j = JSON.parse((ev as MessageEvent).data) as Job; if (j.id === job.id) setJob(j); });
    const poll = window.setInterval(() => { api.job(job.id).then(setJob).catch(() => undefined); }, 1500);
    return () => { es.close(); window.clearInterval(poll); };
  }, [job?.id, job?.status]);

  useEffect(() => {
    if (!job) return;
    if (job.status === "done" && !done.current) {
      done.current = true;
      const r = job.result as { slug?: string; nextSteps?: string[]; character?: string };
      onCreated({ slug: r.slug ?? String(job.brand), steps: r.nextSteps ?? [], character: r.character ?? "none" });
    }
    if (job.status === "failed") { setBusy(false); setError(job.error ?? "The brand could not be created."); }
    if (job.status === "cancelled") { setBusy(false); setError("Creation was cancelled."); }
  }, [job?.status]);

  const start = async (req: CreateRequest) => {
    setBusy(true); setError(null); done.current = false;
    try { const r = await api.createBrand(req); setJob(r.job); } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return { job, error, busy, start };
}

/** The creation job while it runs, or the reason it failed (nothing is left behind: a failed run removes what it made). */
export function CreateStatus({ job, error }: { job: Job | null; error: string | null }) {
  return (
    <>
      {job && <JobCard job={job} open />}
      {error && job?.status === "failed" && <p className="muted" role="status">Everything this attempt made was removed. Fix the problem and press Create again.</p>}
      {error && job?.status !== "failed" && <p className="error" role="alert">{error}</p>}
    </>
  );
}
