import { useState } from "react";
import { api, type InstagramInfo } from "../api";
import { useLoad } from "../hooks";

/**
 * The Instagram login of the brand: whether the session is open, and a button that opens a Chromium window on Instagram's login page.
 * The person logs in there (the password is typed in that window, never in the hub). Without a window of its own in the hub.
 */
export function InstagramAccess({ account }: { account: string }) {
  const [fresh, setFresh] = useState(false);
  const { data, error, reload } = useLoad<InstagramInfo>(() => api.instagram(fresh), [fresh]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const st = data?.status;
  const check = () => { setFresh(true); reload(); };
  const login = () => {
    setBusy(true); setMsg(null);
    api.loginWindow()
      .then(() => setMsg("A Chromium window opened on Instagram's login page. Log in there, then press Check again."))
      .catch((e: Error) => setMsg(e.message))
      .finally(() => setBusy(false));
  };
  return (
    <div className="card row wrap" style={{ margin: 0 }}>
      <div className="grow">
        <span className={`badge ${st?.loggedIn ? "done" : "failed"}`}>{st ? (st.loggedIn ? "logged in" : "not logged in") : "checking"}</span>{" "}
        {account ? <strong>@{account}</strong> : <span className="muted">no account name set above</span>}
        <div className="muted" style={{ fontSize: 12 }}>
          {error ?? st?.message ?? st?.error ?? (st?.checkedAt ? `Checked ${new Date(st.checkedAt).toLocaleTimeString()}` : "")}
        </div>
        {msg && <div className="muted" style={{ fontSize: 12 }}>{msg}</div>}
      </div>
      <button type="button" className="btn" onClick={check}>Check again</button>
      <button type="button" className="btn primary" disabled={busy} onClick={login}>{st?.loggedIn ? "Log in again" : "Log in to Instagram"}</button>
    </div>
  );
}
