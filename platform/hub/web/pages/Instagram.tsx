import { useState } from "react";
import type { BrandSummary, Job } from "../../src/shared/types";
import { api } from "../api";
import { useLoad } from "../hooks";
import { JobCard } from "../components/JobCard";

export function InstagramPage({ jobs, brand }: { jobs: Job[]; brand: BrandSummary }) {
  const [fresh, setFresh] = useState(false);
  const { data, error, reload } = useLoad(() => api.instagram(fresh), [fresh]);
  const [msg, setMsg] = useState<string | null>(null);
  const queue = jobs.filter((j) => j.type === "instagram.schedule" && (j.status === "queued" || j.status === "running"));
  const openLogin = () => api.loginWindow().then((r) => { setMsg(String(r.message ?? "Login window requested.")); reload(); }).catch((e: Error) => setMsg(e.message));
  const st = data?.status;
  const entries = Object.entries(data?.scheduled ?? {}).sort((a, b) => a[1].at.localeCompare(b[1].at));
  return (
    <>
      <h1>Instagram</h1>
      <p className="sub">The scheduler uses its own browser for {brand.name}{(data?.account ?? brand.instagramAccount) ? <> (<strong>@{data?.account ?? brand.instagramAccount}</strong>)</> : null}. Log in once yourself, with that account, in the window below.</p>
      {error && <p className="error">{error}</p>}
      <div className="card row">
        <div className="grow">
          <strong>Session</strong>{" "}
          <span className={`badge ${st?.loggedIn ? "done" : "failed"}`}>{st ? (st.loggedIn ? "logged in" : "not logged in") : "checking"}</span>
          {data?.stub && <span className="badge" style={{ marginLeft: 6 }}>scheduler module missing (stub)</span>}
          <div className="muted">{st?.message ?? st?.error ?? (st?.checkedAt ? `Checked ${new Date(st.checkedAt).toLocaleTimeString()}` : "")}</div>
        </div>
        <button className="btn" onClick={() => { setFresh(true); reload(); }}>Refresh</button>
        <button className="btn primary" onClick={openLogin}>Open login window</button>
      </div>
      {msg && <p className="muted">{msg}</p>}
      <h2>Login window</h2>
      <iframe className="vnc" title="Instagram login window" src="/novnc/vnc.html?autoconnect=true&resize=scale&path=novnc/websockify" />
      <h2>Queue</h2>
      {queue.length === 0 && <p className="muted">No reel waiting.</p>}
      {queue.map((j) => <JobCard key={j.id} job={j} open />)}
      <h2>Scheduled</h2>
      {entries.length === 0 && <p className="muted">Nothing scheduled yet.</p>}
      {entries.map(([k, e]) => (
        <div className="card row" key={k}><div className="grow">{k}</div><span className="badge done">{e.at}</span></div>
      ))}
    </>
  );
}
