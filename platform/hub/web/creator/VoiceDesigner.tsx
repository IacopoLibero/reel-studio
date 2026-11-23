import { useEffect, useRef, useState } from "react";
import { api, type VoiceCandidate, type VoiceRequest } from "../api";
import type { Job } from "../../src/shared/types";
import { ProgressBar } from "../components/JobCard";
import type { ExtrasState } from "./extras";

export type VoiceBrand = VoiceRequest["brand"];

interface Props {
  brand: VoiceBrand;
  character: VoiceRequest["character"] | undefined;
  voice: ExtrasState["voice"];
  onChange: (v: ExtrasState["voice"]) => void;
}

const audioUrl = (id: string): string => `/api/brand-creator/uploads/voice/${id}`;

/** Voice step: the assistant proposes a few voices that fit the brand, VoiceStudio makes each one, you listen and pick one (or ask for others). */
export function VoiceDesigner({ brand, character, voice, onChange }: Props) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(voice);
  useEffect(() => { latest.current = voice; });
  const ready = brand.name.trim().length > 0;
  const working = job !== null && (job.status === "queued" || job.status === "running");

  useEffect(() => {
    if (!job || !working) return;
    let misses = 0;
    const timer = window.setInterval(() => {
      api.job(job.id).then((j) => { misses = 0; setJob(j); }).catch(() => {
        misses += 1;
        if (misses >= 5) { window.clearInterval(timer); setError("Lost track of the voice job. Check that the hub is running, then press the button again."); setJob(null); }
      });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [job?.id, working]);

  useEffect(() => {
    if (!job) return;
    if (job.status === "failed") setError(job.error ?? "The voices could not be made.");
    if (job.status === "cancelled") setError("Making the voices was cancelled.");
    if (job.status !== "done") return;
    const made = (job.result as { voices?: VoiceCandidate[] }).voices ?? [];
    const v = latest.current;
    const kept = v.candidates.filter((c) => c.id === v.wav?.id); // the one already picked stays in the list
    onChange({ ...v, candidates: [...kept, ...made], heard: [...v.heard, ...made.map((c) => c.instruct)].slice(-20) });
  }, [job?.status]);

  const start = async () => {
    setError(null);
    const avoid = voice.heard.slice(-20);
    try {
      const r = await api.proposeVoices({ brand, ...(character ? { character } : {}), ...(avoid.length ? { avoid } : {}) });
      setJob(r.job);
    } catch (e) { setError((e as Error).message); }
  };

  const pick = (c: VoiceCandidate) => onChange({ ...voice, wav: { id: c.id, name: c.label }, text: c.text });

  return (
    <div className="voice-designer">
      <p className="muted">The assistant suggests voices that fit the brand and VoiceStudio makes each one. It takes a minute or two for three voices. Listen, then pick the one you like. The picked voice becomes the brand's voice sample.</p>
      <div className="row">
        <button type="button" className="btn primary" disabled={!ready || working} title={ready ? "" : "Fill in the brand name first"} onClick={() => void start()}>{working ? "Making voices" : voice.candidates.length ? "Make other voices" : "Suggest voices"}</button>
        {!ready && <span className="muted">Fill in the brand name first.</span>}
      </div>
      {working && job && <><p className="muted" role="status">{job.step || "Waiting"}</p><ProgressBar job={job} /></>}
      {error && <p className="error" role="alert">{error}</p>}
      {voice.candidates.length > 0 && (
        <ul className="voice-list" aria-label="Voices to choose from">
          {voice.candidates.map((c) => (
            <li key={c.id} className="card">
              <label className="radio">
                <input type="radio" name="voice-pick" checked={voice.wav?.id === c.id} onChange={() => pick(c)} /> <strong>{c.label}</strong> <span className="muted">· {c.seconds ? `${c.seconds} s · ` : ""}{c.instruct}</span>
              </label>
              <audio controls preload="none" src={audioUrl(c.id)} aria-label={`Listen to ${c.label}`} />
              <p className="muted">&ldquo;{c.text}&rdquo;</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
