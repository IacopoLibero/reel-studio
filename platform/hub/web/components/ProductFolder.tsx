import { useState } from "react";
import { api } from "../api";
import { announceBrandsChanged } from "../hooks";

/** Settings > Product: the folder of the brand's product. Carousels read it (never change it) to show the real screens and copy. */
export function ProductFolder({ current, brandName }: { current: string; brandName: string }) {
  const [value, setValue] = useState(current);
  const [saved, setSaved] = useState(current);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = () => {
    setBusy(true); setMsg(null);
    api.setProductDir(value.trim())
      .then((r) => { setSaved(r.productDir ?? ""); setValue(r.productDir ?? ""); setMsg({ ok: true, text: r.productDir ? `Saved. The next carousel of ${brandName} can show its real screens.` : "Cleared. Carousels will draw the idea instead of showing a product." }); announceBrandsChanged(); })
      .catch((e: Error) => setMsg({ ok: false, text: e.message }))
      .finally(() => setBusy(false));
  };
  return (
    <div className="card" style={{ margin: "0 0 12px" }}>
      <strong>Product folder of {brandName}</strong>
      <p className="muted" style={{ margin: "4px 0 8px" }}>Look-only: the AI reads it to find screenshots, images and the exact words of the product, and never changes anything in it. Reels do not use it; carousels do.</p>
      <div className="row wrap">
        <input type="text" className="mono grow" aria-label="Product folder" value={value} placeholder="/home/me/my-product" onChange={(e) => { setValue(e.target.value); setMsg(null); }} />
        <button type="button" className="btn primary" disabled={busy || value.trim() === saved} onClick={save}>Save</button>
      </div>
      {msg && <p className={msg.ok ? "muted" : "error"} role="status" style={{ margin: "8px 0 0" }}>{msg.text}</p>}
    </div>
  );
}
