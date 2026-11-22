import { useEffect, useState } from "react";
import { api, type VoicePlan, type VoiceSetup } from "../api";

const ROLE_TEXT: Record<string, string> = { TTS: "Voice (speaks the script)", ASR: "Listening (transcribes audio)" };

/**
 * After VoiceStudio is installed: which voice models to download, and which language model (LLM) it uses.
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
      {["TTS", "ASR"].map((role) => (
        <div key={role}>
          <h3>{ROLE_TEXT[role] ?? role}</h3>
          {data.models.filter((m) => m.role === role).map((m) => (
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
      ))}
      {downloading && <p className="muted">Downloading… this can take a while for the larger models.</p>}
      {plan && <PlanCard plan={plan} ack={ack} setAck={setAck} busy={busy} onDownload={download} onCancel={() => setPlan(null)} />}

      <h3>Language model (LLM)</h3>
      <p className="sub">VoiceStudio can use a language model to translate and dub. Reel Studio writes its reels with Claude Code, so you can leave this off.</p>
      <LlmChoice data={data} onSave={(id, key) => run(() => api.setupVoiceLlm(id, key))} busy={busy} />
    </>
  );
}

function PlanCard({ plan, ack, setAck, busy, onDownload, onCancel }: { plan: VoicePlan; ack: boolean; setAck: (v: boolean) => void; busy: boolean; onDownload: () => void; onCancel: () => void }) {
  return (
    <div className="card warn">
      <strong>{plan.repoId}</strong>
      {plan.components.map((c) => <div key={c.id} className="muted">{c.id} · licence: {c.license || "not stated"}{c.url && <> · <a href={c.url} target="_blank" rel="noreferrer">evidence</a></>}</div>)}
      {plan.documents.map((d) => <div key={d.id} className="muted">Notice: {d.url ? <a href={d.url} target="_blank" rel="noreferrer">{d.title}</a> : d.title}</div>)}
      {!plan.ready && <p className="error">VoiceStudio does not let this model be installed from here yet ({plan.blockers.join(", ") || "not reviewed"}). Install it from VoiceStudio's own settings if you need it.</p>}
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

function LlmChoice({ data, onSave, busy }: { data: VoiceSetup; onSave: (id: string, key?: string) => void; busy: boolean }) {
  const [id, setId] = useState(data.llm.active);
  const [key, setKey] = useState("");
  const cur = data.llm.providers.find((p) => p.id === id);
  return (
    <div className="card">
      <div className="row wrap">
        <select aria-label="Language model" value={id} onChange={(e) => { setId(e.target.value); setKey(""); }}>
          {data.llm.providers.map((p) => <option key={p.id} value={p.id}>{p.label}{p.local && p.id !== "off" ? " (on this computer)" : ""}</option>)}
        </select>
        {cur?.needsKey && <input type="password" autoComplete="off" placeholder={cur.hasKey ? "API key saved (type to replace)" : "API key"} value={key} onChange={(e) => setKey(e.target.value)} style={{ flex: 1, minWidth: 200 }} />}
        <button className="btn" type="button" disabled={busy || (id === data.llm.active && !key)} onClick={() => { onSave(id, key || undefined); setKey(""); }}>Save</button>
      </div>
      {cur?.notes && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{cur.notes}{cur.signupUrl && <> <a href={cur.signupUrl} target="_blank" rel="noreferrer">Get a key</a></>}</div>}
    </div>
  );
}
