import type { Job } from "../../src/shared/types";
import { JobCard } from "../components/JobCard";

export function JobsPage({ jobs }: { jobs: Job[] }) {
  const active = jobs.filter((j) => j.status === "running" || j.status === "queued");
  const past = jobs.filter((j) => !active.includes(j));
  return (
    <>
      <h1>Jobs</h1>
      <p className="sub">Everything the hub is doing or has done. Progress updates live.</p>
      {active.length === 0 && <p className="muted">{past.length === 0 ? "No jobs yet. Everything this brand does (ideas, reels, scheduling) shows up here with live progress." : "Nothing running."}</p>}
      {active.map((j) => <JobCard key={j.id} job={j} open />)}
      {past.length > 0 && <h2>History</h2>}
      {past.map((j) => <JobCard key={j.id} job={j} />)}
    </>
  );
}
