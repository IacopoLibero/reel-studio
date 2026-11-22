import { useEffect, useState } from "react";
import { api, type VoicePlan, type VoiceSetup } from "../api";
import { formatBytes, formatEta, summarizeJobs, type DownloadJob } from "../../src/shared/voice-progress";

const NON_COMMERCIAL = /\bNC\b|non-?commercial/i;
/**
 * The voice models of VoiceStudio (only voices; transcription and language models are not used by Reel Studio): download, choose the one to use, remove.
 * Used in the first-run setup and in Settings. Each model shows its licence first, and nothing downloads until the person ticks that they read it.
 */
export function SetupVoice() {
  const [data, setData] = useState<VoiceSetup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<VoicePlan | null>(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const load = () => api.setupVoice().then(setData).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, []);
  const jobs = summarizeJobs(data?.status);
  const downloading = jobs.length > 0;
  useEffect(() => {
    if (!downloading) return;
    const t = setInterval(() => { void load(); }, 2000);
    return () => clearInterval(t);
  }, [downloading]);

  const run = (fn: () => Promise<unknown>) => { setError(null); setBusy(true); fn().then(load).catch((e: Error) => setError(e.message)).finally(() => setBusy(false)); };
  const review = (repoId: string) => run(async () => { setAck(false); setPlan(await api.setupVoicePlan(repoId)); });
  const choose = (engine: string) => run(() => api.setupVoiceSelect(engine));
  const remove = (repoId: string) => run(async () => { setRemoving(null); await api.setupVoiceRemove(repoId); });
  const cancel = (repoId: string) => run(() => api.setupVoiceCancel(repoId));
  const download = () => plan && run(async () => { await api.setupVoiceInstall(plan.repoId, ack); setPlan(null); });

  if (!data) return <p className="muted">{error ?? "Asking VoiceStudio…"}</p>;
  if (!data.running) return <p className="muted">{data.message ?? "VoiceStudio is not running."} The models appear here once it is.</p>;
  return (
    <>
      {error && <p className="error">{error}</p>}
      <div>
          {data.models.map((m) => {
            const job = jobs.find((j) => j.repoId === m.repoId);
            const inUse = !!m.engine && m.engine === data.active;
            const ready = m.installed && !job;
            const usable = !!m.engine && data.engines.some((e) => e.id === m.engine && e.available);
            return (
              <div key={m.repoId} className="card" style={inUse ? { borderColor: "var(--accent)" } : undefined}>
                <div className="row wrap">
                  <span className={`badge ${job || inUse ? "running" : m.installed ? "done" : ""}`}>{job ? "downloading" : inUse ? "in use" : m.installed ? "installed" : m.required ? "recommended" : "not installed"}</span>
                  <strong>{m.label}</strong>
                  <span className="muted" style={{ flex: 1 }}>{m.sizeGb >= 1 ? `${m.sizeGb} GB` : `${Math.round(m.sizeGb * 1000)} MB`}</span>
                  {job && <button className="btn" type="button" disabled={busy} onClick={() => cancel(m.repoId)}>Cancel download</button>}
                  {!ready && !job && <button className="btn" type="button" disabled={busy || downloading} onClick={() => review(m.repoId)}>Review and download</button>}
                  {ready && !inUse && usable && <button className="btn primary" type="button" disabled={busy} onClick={() => m.engine && choose(m.engine)}>Use this voice</button>}
                  {ready && removing !== m.repoId && <button className="btn" type="button" disabled={busy || inUse} title={inUse ? "Choose another voice first" : undefined} onClick={() => setRemoving(m.repoId)}>Remove</button>}
                  {removing === m.repoId && (
                    <>
                      <span className="muted">Delete {m.sizeGb >= 1 ? `${m.sizeGb} GB` : `${Math.round(m.sizeGb * 1000)} MB`} from this computer?</span>
                      <button className="btn" type="button" disabled={busy} onClick={() => remove(m.repoId)}>Yes, remove</button>
                      <button className="btn" type="button" onClick={() => setRemoving(null)}>Keep</button>
                    </>
                  )}
                </div>
                {job && <Progress job={job} />}
                {ready && !usable && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Downloaded, but VoiceStudio cannot use this voice yet{data.engines.find((e) => e.id === m.engine)?.reason ? `: ${data.engines.find((e) => e.id === m.engine)?.reason}` : ""}.</div>}
                {m.note && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{m.note}</div>}
              </div>
            );
          })}
        </div>
      {plan && <PlanCard plan={plan} ack={ack} setAck={setAck} busy={busy} onDownload={download} onCancel={() => setPlan(null)} />}

    </>
  );
}

function PlanCard({ plan, ack, setAck, busy, onDownload, onCancel }: { plan: VoicePlan; ack: boolean; setAck: (v: boolean) => void; busy: boolean; onDownload: () => void; onCancel: () => void }) {
  return (
    <div className="card warn">
      <strong>{plan.repoId}</strong>
      {plan.components.map((c) => <div key={c.id} className="muted">{c.id} · licence: {c.license || "not stated"}{c.url && <> · <a href={c.url} target="_blank" rel="noreferrer">evidence</a></>}</div>)}
      {plan.documents.map((d) => <div key={d.id} className="muted">Notice: {d.url ? <a href={d.url} target="_blank" rel="noreferrer">{d.title}</a> : d.title}</div>)}
      {!plan.ready && <p className="muted">VoiceStudio's own licence review of this model is not finished, so the licence above is what it lists, not a verified answer.</p>}
      {NON_COMMERCIAL.test(plan.components.map((c) => c.license).join(" ")) && <p className="error">This licence does not allow commercial use. Reels published for a business may not be covered.</p>}
          <label style={{ display: "block", margin: "10px 0" }}><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I read the licence of this model and accept it.</label>
          <button className="btn primary" type="button" disabled={!ack || busy} onClick={onDownload}>Download</button>{" "}
      <button className="btn" type="button" onClick={onCancel}>Cancel</button>
    </div>
  );
}


function Progress({ job }: { job: DownloadJob }) {
  const known = job.percent !== null;
  return (
    <div style={{ marginTop: 8 }}>
      <div role="progressbar" aria-label={`Downloading ${job.repoId}`} aria-valuemin={0} aria-valuemax={100} {...(job.percent !== null ? { "aria-valuenow": job.percent } : {})}
        style={{ height: 8, borderRadius: 4, background: "var(--panel2)", border: "1px solid var(--line)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: known ? `${job.percent}%` : "30%", background: "var(--accent)", transition: "width .5s" }} />
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        {known ? `${job.percent}% · ` : ""}{formatBytes(job.bytesDone)}{job.totalBytes > 0 ? ` of ${formatBytes(job.totalBytes)}` : ""}
        {job.rate ? ` · ${(job.rate / 1e6).toFixed(1)} MB/s` : ""}{job.etaSeconds !== null ? ` · ${formatEta(job.etaSeconds)}` : ""}
      </div>
    </div>
  );
}
