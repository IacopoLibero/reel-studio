import { useState } from "react";
import { api } from "../api";

export function Login({ onDone }: { onDone: () => void }) {
  const [token, setToken] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    api.login(token).then(onDone).catch((x: Error) => setErr(x.message));
  };
  return (
    <form className="login" onSubmit={submit}>
      <h1>Reel <span style={{ color: "var(--accent)" }}>Hub</span></h1>
      <p className="sub">Enter the hub token to continue.</p>
      <input type="password" autoFocus value={token} onChange={(e) => setToken(e.target.value)} placeholder="Token" />
      {err && <p className="error">{err}</p>}
      <p><button className="btn primary" disabled={!token}>Sign in</button></p>
    </form>
  );
}
