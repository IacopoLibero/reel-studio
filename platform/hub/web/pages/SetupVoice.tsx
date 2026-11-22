import { useEffect, useState } from "react";
import { api, type VoicePlan, type VoiceSetup } from "../api";

const BLOCKER_TEXT: Record<string, string> = {
  artifact_manifest_unverified: "its file list is not verified",
  component_closure_incomplete: "parts it depends on are not all listed",
  terms_unverified: "its terms of use are not verified",
  upstream_access_unverified: "its source access conditions are not verified",
};

/**
 * After VoiceStudio is installed: which voice models to download (only voices; transcription and language models are not used by Reel Studio).
 * Each model is reviewed first: VoiceStudio gives its licence and notices, and nothing downloads until the person ticks that they read them.
 */
export function SetupVoice() {
  const [data, setData] = useState<VoiceSetup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<VoicePlan | null>(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = () => api.setupVoice().then(setData).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, []);
  const downloading = !!data?.status?.jobs?.some((j) => j.state === "running" || j.state === "queued");
  useEffect(() => {
    if (!downloading) return;
    const t = setInterval(() => { void load(); }, 3000);
    return () => clearInterval(t);
  }, [downloading]);

  const run = (fn: () => Promise<unknown>) => { setError(null); setBusy(true); fn().then(load).catch((e: Error) => setError(e.message)).finally(() => setBusy(false)); };
  const review = (repoId: string) => run(async () => { setAck(false); setPlan(await api.setupVoicePlan(repoId)); });
  const download = () => plan && run(async () => { await api.setupVoiceInstall(plan, ack); setPlan(null); });

  if (!data) return <p className="muted">{error ?? "Asking VoiceStudio…"}</p>;
  if (!data.running) return <p className="muted">{data.message ?? "VoiceStudio is not running."} The models appear here once it is.</p>;
  return (
    <>
      {error && <p className="error">{error}</p>}
      <div>
          {data.models.map((m) => (
            <div key={m.repoId} className="card">
              <div className="row wrap">
                <span className={`badge ${m.installed ? "done" : ""}`}>{m.installed ? "installed" : m.required ? "recommended" : "not installed"}</span>
                <strong>{m.label}</strong>
                <span className="muted" style={{ flex: 1 }}>{m.sizeGb >= 1 ? `${m.sizeGb} GB` : `${Math.round(m.sizeGb * 1000)} MB`}</span>
                {!m.installed && <button className="btn" type="button" disabled={busy || downloading} onClick={() => review(m.repoId)}>Review and download</button>}
              </div>
              {m.note && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{m.note}</div>}
            </div>
          ))}
        </div>
      {downloading && <p className="muted">Downloading… this can take a while for the larger models.</p>}
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
      {!plan.ready && (
        <p className="error">
          VoiceStudio has not verified this model yet, so it will not download it: {plan.blockers.map((b) => BLOCKER_TEXT[b] ?? b).join("; ") || "it was not reviewed"}.
          This is VoiceStudio's own check of licences and sources, and it is not something you can fix here. Check the licence above before you look for another way to get it
          (some licences, such as CC-BY-NC, do not allow commercial use). Reel Studio does not need this model if another voice above is installed.
        </p>
      )}
      {plan.ready && (
        <>
          <label style={{ display: "block", margin: "10px 0" }}><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> {plan.acknowledgement || "I read the notices for this model."}</label>
          <button className="btn primary" type="button" disabled={!ack || busy} onClick={onDownload}>Download</button>{" "}
        </>
      )}
      <button className="btn" type="button" onClick={onCancel}>Cancel</button>
    </div>
  );
}

