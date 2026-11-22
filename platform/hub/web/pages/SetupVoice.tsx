import { useEffect, useState } from "react";
import { api, type VoicePlan, type VoiceSetup } from "../api";

const NON_COMMERCIAL = /\bNC\b|non-?commercial/i;
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
  const download = () => plan && run(async () => { await api.setupVoiceInstall(plan.repoId, ack); setPlan(null); });

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
      {!plan.ready && <p className="muted">VoiceStudio's own licence review of this model is not finished, so the licence above is what it lists, not a verified answer.</p>}
      {NON_COMMERCIAL.test(plan.components.map((c) => c.license).join(" ")) && <p className="error">This licence does not allow commercial use. Reels published for a business may not be covered.</p>}
          <label style={{ display: "block", margin: "10px 0" }}><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I read the licence of this model and accept it.</label>
          <button className="btn primary" type="button" disabled={!ack || busy} onClick={onDownload}>Download</button>{" "}
      <button className="btn" type="button" onClick={onCancel}>Cancel</button>
    </div>
  );
}

