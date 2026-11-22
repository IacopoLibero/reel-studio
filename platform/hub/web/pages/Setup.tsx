import { useEffect, useRef, useState } from "react";
import { api, type SetupData, type SetupItem } from "../api";
import { SetupVoice } from "./SetupVoice";

const stateText = { idle: "", running: "Installing…", done: "Done", failed: "Failed" } as const;

/** The first-run screen: what Reel Studio needs on this computer, the voice mode, and buttons that install what the app can install itself. */
export function SetupPage({ onFinished, onSkip }: { onFinished: () => void; onSkip?: () => void }) {
  const [data, setData] = useState<SetupData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const load = () => api.setup().then((d) => { setData(d); setMode((m) => m ?? d.state.voiceMode ?? d.recommended); }).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, []);
  const running = !!data && Object.values(data.steps).some((s) => s.state === "running");
  // While something installs, ask again every two seconds: the log and the checks follow.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => { void load(); }, 2000);
    return () => clearInterval(t);
  }, [running]);

  if (!data) return <p className={error ? "error" : "muted"}>{error ?? "Checking this computer…"}</p>;
  const blockers = data.items.filter((i) => i.required && i.status === "missing");
  const act = (fn: () => Promise<unknown>) => { setError(null); fn().then(load).catch((e: Error) => setError(e.message)); };
  const install = (id: string) => act(async () => { if (id === "voicestudio" && mode) await api.setupVoiceMode(mode); await api.setupStep(id); });
  const finish = () => act(async () => { if (mode) await api.setupVoiceMode(mode); await api.setupComplete(); onFinished(); });
  const chosen = data.modes.find((m) => m.id === mode);

  return (
    <>
      <h1>Set up Reel Studio</h1>
      <p className="sub">Reel Studio needs a few programs on this computer. What is missing and can be installed here has an Install button. Nothing leaves your studio folder.</p>
      {error && <p className="error">{error}</p>}

      <h2>What it needs</h2>
      {data.items.map((i) => <ItemRow key={i.id} item={i} step={data.steps[i.id]} voiceChosen={!!mode} onInstall={() => install(i.id)} />)}

      <h2>Voice</h2>
      <p className="sub">VoiceStudio can make voices in several ways. Pick one; you can change it later.</p>
      <div role="radiogroup" aria-label="Voice mode">
        {data.modes.map((m) => (
          <label key={m.id} className="card" style={{ display: "block", cursor: "pointer", borderColor: mode === m.id ? "var(--accent)" : undefined }}>
            <input type="radio" name="voice-mode" checked={mode === m.id} onChange={() => setMode(m.id)} />{" "}
            <strong>{m.label}</strong>{m.id === data.recommended && <span className="badge done" style={{ marginLeft: 8 }}>recommended</span>}
            <div className="muted">{m.description}{m.downloadGb > 0 && ` Download about ${m.downloadGb} GB.`}</div>
          </label>
        ))}
      </div>
      {chosen && chosen.needsGpu && data.items.find((i) => i.id === "gpu")?.status === "missing" && <p className="error">No NVIDIA graphics card was found, so this mode will not work. Pick a processor mode.</p>}

      {data.items.find((i) => i.id === "voicestudio")?.status === "ok" && (
        <>
          <h2>Voice models</h2>
          <p className="sub">Choose which models VoiceStudio downloads. You can come back here later from Setup.</p>
          <SetupVoice />
        </>
      )}

      <div className="row wrap" style={{ marginTop: 16 }}>
        <button className="btn primary" type="button" disabled={blockers.length > 0 || running} onClick={finish}>Finish setup</button>
        {onSkip && <button className="btn" type="button" onClick={onSkip}>Skip for now</button>}
        {blockers.length > 0 && <span className="muted">Still needed: {blockers.map((b) => b.label).join(", ")}.</span>}
      </div>
    </>
  );
}

function ItemRow({ item, step, voiceChosen, onInstall }: { item: SetupItem; step: SetupData["steps"][string] | undefined; voiceChosen: boolean; onInstall: () => void }) {
  const busy = step?.state === "running";
  const showLog = !!step && step.state !== "idle" && step.lines.length > 0;
  return (
    <div className="card">
      <div className="row wrap">
        <span className={`badge ${item.status === "ok" ? "done" : item.required ? "failed" : ""}`}>{item.status === "ok" ? "ready" : item.required ? "needed" : "optional"}</span>
        <strong>{item.label}</strong>
        <span className="muted" style={{ flex: 1 }}>{item.status === "ok" ? item.detail : item.hint}</span>
        {item.auto && item.status === "missing" && (
          <button className="btn" type="button" disabled={busy || (item.id === "voicestudio" && !voiceChosen)} onClick={onInstall}>
            {busy ? "Installing…" : step?.state === "failed" ? "Try again" : "Install"}
          </button>
        )}
        {step && step.state !== "idle" && <span className={`badge ${step.state === "done" ? "done" : step.state === "failed" ? "failed" : "running"}`}>{stateText[step.state]}</span>}
      </div>
      {step?.error && <p className="error" style={{ whiteSpace: "pre-wrap" }}>{step.error}</p>}
      {showLog && <LogTail lines={step.lines.slice(-30)} />}
    </div>
  );
}

/** The last lines of an install step, scrolled to the newest one (the box is short, so without this the person sees the oldest of them). */
function LogTail({ lines }: { lines: string[] }) {
  const box = useRef<HTMLPreElement>(null);
  useEffect(() => { const el = box.current; if (el) el.scrollTop = el.scrollHeight; }, [lines.length, lines[lines.length - 1]]);
  return <pre ref={box} className="muted" role="log" aria-live="off" style={{ maxHeight: 140, overflow: "auto", fontSize: 12, margin: "8px 0 0" }}>{lines.join("\n")}</pre>;
}
