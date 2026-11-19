import { useState } from "react";
import type { BrandSummary } from "../../src/shared/types";
import { routeHash } from "../hooks";

const KEY = "reelhub.welcome";
interface Welcome { slug: string; character: string }

export const markWelcome = (w: Welcome): void => { try { window.sessionStorage.setItem(KEY, JSON.stringify(w)); } catch { /* private mode: no checklist */ } };
const readWelcome = (): Welcome | null => { try { return JSON.parse(window.sessionStorage.getItem(KEY) ?? "null") as Welcome | null; } catch { return null; } };

/** The short checklist shown once on a brand that was just created, above whatever page it lands on. */
export function NextSteps({ brand }: { brand: BrandSummary }) {
  const [w, setW] = useState(() => { const x = readWelcome(); return x?.slug === brand.slug ? x : null; });
  if (!w) return null;
  const close = () => { try { window.sessionStorage.removeItem(KEY); } catch { /* ignore */ } setW(null); };
  return (
    <div className="card welcome" role="region" aria-label="Next steps">
      <div className="row"><strong className="grow">{brand.name} is ready. Next steps to your first reel:</strong><button type="button" className="btn small" onClick={close}>Dismiss</button></div>
      <ol>
        <li>Log in to Instagram on <a href={routeHash(brand.slug, "instagram")}>this brand's Instagram page</a>, once, in the window that opens there.</li>
        <li>Add your first questions in the <a href={routeHash(brand.slug, "factory")}>Factory</a>, or press &ldquo;Find ideas&rdquo; there to get a list to accept from.</li>
        <li>Pick a question and send it to the factory: that makes your first reel.</li>
        {w.character === "create" && <li>Your character: open the <a href={routeHash(brand.slug, "character")}>Character page</a> to upload the reference sheet and try a first version.</li>}
      </ol>
    </div>
  );
}
