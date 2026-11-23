import { useState } from "react";
import { api, type AccessState } from "../api";
import { useLoad } from "../hooks";
import { announceAiChanged } from "./AiUsage";

const TEXT = {
  claude: {
    name: "Claude", login: "Uses the login of Claude Code on this computer (your Claude subscription). Log in once by running `claude` in a terminal.",
    key: "An Anthropic API key: every job is paid per use on your Anthropic account, and the subscription limits do not apply.", placeholder: "sk-ant-…",
  },
  codex: {
    name: "Codex", login: "Uses the login of the Codex CLI on this computer (your ChatGPT account). Log in once with `codex login`.",
    key: "An OpenAI API key: paid per use on your OpenAI account.", placeholder: "sk-…",
  },
} as const;

/** One tool's access: its own login, or an API key. The key is only ever sent to the hub; the page shows its last four characters. */
function Access({ provider, state, onChanged }: { provider: "claude" | "codex"; state: AccessState; onChanged: () => void }) {
  const t = TEXT[provider];
  const [mode, setMode] = useState(state.mode);
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<unknown>) => { setBusy(true); setMsg(null); fn().then(() => { setKey(""); onChanged(); announceAiChanged(); }).catch((e: Error) => setMsg({ ok: false, text: e.message })).finally(() => setBusy(false)); };
  const save = () => run(async () => { await api.aiAccess(provider, { mode, ...(key.trim() ? { apiKey: key } : {}) }); setMsg({ ok: true, text: "Saved." }); });
  const test = () => run(async () => { const r = await api.aiCheck(provider); setMsg(r.ok ? { ok: true, text: `${t.name} answered: it works.` } : { ok: false, text: r.error ?? "It did not work." }); });
  const remove = () => run(async () => { await api.aiAccess(provider, { mode: "login", removeKey: true }); setMode("login"); setMsg({ ok: true, text: "The key was removed." }); });
  const needsKey = mode === "api-key" && !state.hasKey && !key.trim();
  return (
    <div className="card" style={{ margin: 0 }}>
      <strong>{t.name}</strong>
      <div role="radiogroup" aria-label={`${t.name} access`} style={{ margin: "8px 0" }}>
        <label style={{ display: "block", margin: "4px 0" }}><input type="radio" name={`${provider}-mode`} checked={mode === "login"} onChange={() => setMode("login")} /> Login <span className="muted">· {t.login}</span></label>
        <label style={{ display: "block", margin: "4px 0" }}><input type="radio" name={`${provider}-mode`} checked={mode === "api-key"} onChange={() => setMode("api-key")} /> API key <span className="muted">· {t.key}</span></label>
      </div>
      {mode === "api-key" && (
        <div className="row wrap" style={{ margin: "6px 0" }}>
          <input type="password" autoComplete="off" spellCheck={false} aria-label={`${t.name} API key`} placeholder={state.hasKey ? `Key saved (${state.keyHint}). Type to replace it` : t.placeholder} value={key} onChange={(e) => setKey(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
          {state.hasKey && <button type="button" className="btn small" disabled={busy} onClick={remove}>Remove key</button>}
        </div>
      )}
      <div className="row wrap">
        <button type="button" className="btn primary" disabled={busy || needsKey || (mode === state.mode && !key.trim())} onClick={save}>Save</button>
        <button type="button" className="btn" disabled={busy} onClick={test} title="Makes one tiny call to see that it works (one small call)">{busy ? "Working…" : "Test"}</button>
        {msg && <span className={msg.ok ? "muted" : "error"} style={{ margin: 0 }}>{msg.text}</span>}
      </div>
      <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>Now in use: <strong>{state.mode === "api-key" ? `API key ${state.keyHint}` : "login"}</strong>.{state.hasKey ? " The key is kept in a file only you can read, in the data folder." : ""}</p>
    </div>
  );
}

/** Settings > Claude and Codex: how each one signs in. */
export function AiAccess() {
  const { data, error, reload } = useLoad(api.ai);
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Access provider="claude" state={data.claude.access} onChanged={reload} />
      <Access provider="codex" state={data.codex.access} onChanged={reload} />
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>Claude runs the jobs (scripts, ideas, readouts, reel changes). Codex is only an option for the brand interview (Settings, Brand assistant; not tested). A change applies to the next job; a job that is running keeps what it started with.</p>
    </div>
  );
}
