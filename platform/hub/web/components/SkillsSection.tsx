import { useEffect, useState } from "react";
import type { SkillView, SkillsData } from "../../src/shared/types";
import { api } from "../api";
import { Dialog } from "./Dialog";

const GROUPS: { risk: SkillView["risk"]; title: string; note: string }[] = [
  { risk: "safe", title: "Safe", note: "Write copy and plans only. They never leave this machine." },
  { risk: "conflict", title: "Overlap with the reel skill", note: "Work against how the reel skill already makes reels. Keep off unless you know why." },
  { risk: "outward", title: "Reach outside", note: "Can message people or download from the internet. Claude asks before each send." },
];

export function SkillsSection() {
  const [data, setData] = useState<SkillsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<SkillView | null>(null);
  useEffect(() => { api.skills().then(setData).catch((e: Error) => setError(e.message)); }, []);

  const run = async (key: string, fn: () => Promise<SkillsData>) => {
    setBusy(key); setError(null);
    try { setData(await fn()); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const toggle = (s: SkillView, confirmed = false) => run(s.name, () => api.changeSkills(s.enabled ? { disable: [s.name] } : { enable: [s.name], confirmOutward: confirmed }));
  const onSwitch = (s: SkillView) => (!s.enabled && s.risk === "outward" ? setConfirm(s) : void toggle(s));
  const onCount = data ? data.skills.filter((s) => s.enabled).length : 0;

  return (
    <>
      <h2>Content skills</h2>
      <p className="muted" style={{ marginTop: 0 }}>Skills from Ootto (MIT) that Claude can use for ideas, hooks, captions and plans. {data && `${onCount} of ${data.skills.length} are on.`}</p>
      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="muted">Loading</p>}
      {data && (
        <>
          <p><button className="btn" disabled={busy !== null} onClick={() => void run("reset", api.resetSkills)}>Reset to defaults</button></p>
          <div className="card">
            <div className="row"><strong className="grow">Ours</strong><span className="badge">always on</span></div>
            <p className="muted" style={{ margin: "4px 0 8px" }}>Built for this project. Read only: they cannot be switched off.</p>
            <div className="skill-grid">
            {data.ours.map((s) => (
              <div className="skill" key={s.name}>
                <button className="switch" role="switch" aria-checked={true} aria-label={`${s.name} always on`} disabled />
                <div className="grow"><div className="nm">{s.name}</div><div className="muted">{s.description}</div></div>
              </div>
            ))}
            </div>
          </div>
          {GROUPS.map((g) => {
            const items = data.skills.filter((s) => s.risk === g.risk);
            const c = data.counts[g.risk];
            return (
              <div className="card" key={g.risk}>
                <div className="row"><strong className="grow">{g.title}</strong><span className="badge">{c.enabled} of {c.total} on</span></div>
                <p className="muted" style={{ margin: "4px 0 8px" }}>{g.note}</p>
                <div className="skill-grid">
                {items.map((s) => (
                  <div className="skill" key={s.name}>
                    <button className="switch" role="switch" aria-checked={s.enabled} aria-label={`${s.name} on or off`} disabled={busy !== null} onClick={() => onSwitch(s)} />
                    <div className="grow">
                      <div className="nm">{s.name}{s.defaultEnabled && <span className="muted" style={{ fontWeight: 400 }}> · on by default</span>}</div>
                      {s.reason && <div className="muted">{s.reason}</div>}
                    </div>
                  </div>
                ))}
                </div>
              </div>
            );
          })}
        </>
      )}
      {confirm && (
        <Dialog title={`Turn on ${confirm.name}?`} onClose={() => setConfirm(null)}>
          <p>This skill can message people or download files and pages from the internet ({confirm.reason || "it reaches outside this machine"}).</p>
          <p className="muted">Claude will ask you before each send. Nothing is sent without your yes.</p>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="btn primary" onClick={() => { const s = confirm; setConfirm(null); void toggle(s, true); }}>Turn on</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
