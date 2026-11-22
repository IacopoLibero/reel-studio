import { useState } from "react";
import type { BrandSummary } from "../../src/shared/types";
import { api } from "../api";
import { routeHash } from "../hooks";

export const FIRST_REEL_IDEAS = 10;

const KEY = "reelhub.welcome";
interface Welcome { slug: string; character: string }

export const markWelcome = (w: Welcome): void => { try { window.sessionStorage.setItem(KEY, JSON.stringify(w)); } catch { /* private mode: no checklist */ } };
const readWelcome = (): Welcome | null => { try { return JSON.parse(window.sessionStorage.getItem(KEY) ?? "null") as Welcome | null; } catch { return null; } };

/** The short checklist shown once on a brand that was just created, above whatever page it lands on. */
export function NextSteps({ brand }: { brand: BrandSummary }) {
  const [w, setW] = useState(() => { const x = readWelcome(); return x?.slug === brand.slug ? x : null; });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!w) return null;
  // Asks the assistant for the first questions, then opens the Factory where the proposed ideas and the running job show up.
  const firstReel = () => {
    setBusy(true); setErr(null);
    api.createJob("reel.ideas", { count: FIRST_REEL_IDEAS })
      .then(() => { window.location.hash = routeHash(brand.slug, "factory"); })
      .catch((e: Error) => { if (/already/i.test(e.message)) window.location.hash = routeHash(brand.slug, "factory"); else setErr(e.message); })
      .finally(() => setBusy(false));
  };
  const close = () => { try { window.sessionStorage.removeItem(KEY); } catch { /* ignore */ } setW(null); };
  return (
    <div className="card welcome" role="region" aria-label="Next steps">
      <div className="row"><strong className="grow">{brand.name} is ready. Next steps to your first reel:</strong><button type="button" className="btn small" onClick={close}>Dismiss</button></div>
      <ol>
        <li>Log in to Instagram, once, in <a href={routeHash(brand.slug, "settings")}>Settings</a> (the Instagram section): a Chromium window opens for it.</li>
        <li>
          Get your first questions: <button type="button" className="btn small primary" disabled={busy} onClick={firstReel}>{busy ? "Starting" : `Propose ${FIRST_REEL_IDEAS} first questions`}</button>
          {err && <span className="error"> {err}</span>}
          <span className="muted"> The assistant reads what you told it about the brand; you accept the ones you like in the <a href={routeHash(brand.slug, "factory")}>Factory</a>. You can also type your own there.</span>
        </li>
        <li>Pick a question and send it to the factory: that makes your first reel.</li>
        {w.character === "create" && <li>Your character: open the <a href={routeHash(brand.slug, "character")}>Character page</a> to upload the reference sheet and try a first version.</li>}
      </ol>
    </div>
  );
}
