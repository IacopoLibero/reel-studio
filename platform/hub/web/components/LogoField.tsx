import { useState } from "react";
import { api } from "../api";
import { Row } from "./SettingsParts";

const MAX_BYTES = 1024 * 1024;

/** The brand's logo after creation: shows it the way the cover frames it, and sets, replaces or removes it. Saves at once (it is a file, not a setting). */
export function LogoField({ colors, initial }: { colors: { background: string; text: string }; initial: boolean }) {
  const [has, setHas] = useState(initial);
  const [version, setVersion] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (work: () => Promise<unknown>, done: string, after: boolean) => {
    setBusy(true); setMsg(null);
    try { await work(); setHas(after); setVersion(Date.now()); setMsg({ ok: true, text: done }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  };
  const pick = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) { setMsg({ ok: false, text: "The file is too big: the limit is 1 MB." }); return; }
    void run(() => api.setLogo(file), "Logo saved. New covers and reels use it.", true);
  };

  return (
    <Row label="Logo" htmlFor="s-logo" help="A PNG up to 1 MB, ideally with a transparent background. Shown in a frame on every cover and on the last card of a reel. Without one the cover has no frame.">
      <div className="logo-field">
        <div className="logo-frame" style={{ background: colors.background, borderColor: colors.text }} aria-label="Logo preview">
          {has ? <img alt="Your logo" src={api.logoUrl(version)} onError={() => setHas(false)} /> : <span className="muted">No logo yet</span>}
        </div>
        <div className="row">
          <input id="s-logo" type="file" accept="image/png,.png" disabled={busy} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          {has && <button type="button" className="btn" disabled={busy} onClick={() => void run(() => api.removeLogo(), "Logo removed. New covers have no logo frame.", false)}>Remove logo</button>}
        </div>
        {busy && <p className="muted">Saving</p>}
        {msg && <p className={msg.ok ? "muted" : "error"} aria-live="polite">{msg.text}</p>}
      </div>
    </Row>
  );
}
