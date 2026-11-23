import { useEffect, useState } from "react";
import { api, type AiState, type LimitWindow } from "../api";
import { routeHash } from "../hooks";
import { ago, dollars, levelOf, percent, resetsIn } from "../ai-usage";

/** Tells the rest of the page that the Claude access or usage changed (Settings saved a key, a check ran), so the sidebar reads it again. */
export const AI_CHANGED = "reelhub:ai-changed";
export const announceAiChanged = (): void => { window.dispatchEvent(new Event(AI_CHANGED)); };

function Meter({ label, w, now }: { label: string; w: LimitWindow | null; now: number }) {
  if (!w) return <div className="ai-row muted"><span>{label}</span><span>no reading</span></div>;
  const p = percent(w.utilization);
  return (
    <div className="ai-row" title={`${label}: ${p}% used, resets ${resetsIn(w.resetsAt, now) || "at an unknown time"}`}>
      <span>{label}</span>
      <div className={`ai-bar ${levelOf(w.utilization)}`} role="progressbar" aria-label={`${label} used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p}><i style={{ width: `${p}%` }} /></div>
      <span className="ai-num">{p}%</span>
      <span className="ai-reset muted">{resetsIn(w.resetsAt, now)}</span>
    </div>
  );
}

/**
 * The sidebar block: how much of Claude's session (five hours) and week the subscription has used, or, with an API key, what the jobs cost.
 * The numbers come from what Claude reports while it works, so they are as fresh as the last job; "Check" asks for a new reading.
 */
export function AiUsage({ brand }: { brand: string | null }) {
  const [data, setData] = useState<AiState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api.ai().then((d) => { setData(d); setNow(Date.now()); }).catch(() => undefined);
  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, 30_000);
    window.addEventListener(AI_CHANGED, load);
    return () => { clearInterval(t); window.removeEventListener(AI_CHANGED, load); };
  }, []);
  if (!data) return null;
  const { access, usage } = data.claude;
  const label = access.mode === "api-key" ? `API key ${access.keyHint}` : "subscription";
  const check = () => { setBusy(true); setErr(null); api.aiCheck("claude").then((r) => { if (!r.ok) setErr(r.error ?? "It did not work."); return load(); }).catch((e: Error) => setErr(e.message)).finally(() => setBusy(false)); };
  return (
    <div className="ai-usage" aria-label="Claude usage">
      <div className="ai-head">
        {brand
          ? <a href={routeHash(brand, "settings")} onClick={() => { setTimeout(() => document.getElementById("set-ai")?.scrollIntoView({ behavior: "smooth" }), 300); }}>Claude · {label}</a>
          : <span>Claude · {label}</span>}
      </div>
      {access.mode === "api-key" ? (
        <div className="ai-row"><span>Cost</span><span className="ai-money">today {dollars(usage.cost.today)} · 7 days {dollars(usage.cost.week)}</span></div>
      ) : (
        <>
          <Meter label="Session" w={usage.limits?.session ?? null} now={now} />
          <Meter label="Week" w={usage.limits?.week ?? null} now={now} />
          <div className="ai-foot muted">
            <span>{usage.limits ? `read ${ago(usage.limits.updatedAt, now)}` : "no reading yet"}</span>
            <button type="button" className="btn small" disabled={busy} onClick={check} title="Ask Claude for a new reading (one small call)">{busy ? "…" : "Check"}</button>
          </div>
        </>
      )}
      {err && <div className="error" style={{ fontSize: 11, margin: "4px 0 0" }}>{err}</div>}
    </div>
  );
}
