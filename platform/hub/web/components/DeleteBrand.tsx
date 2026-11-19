import { useState } from "react";
import type { BrandSummary } from "../../src/shared/types";
import { api } from "../api";
import { Row, Section } from "./SettingsParts";

/** Delete brand: types the slug to confirm; the folders go to platform/data/trash/, not into thin air. */
export function DeleteBrand({ brand }: { brand: BrandSummary }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const del = async () => {
    setBusy(true); setError(null);
    try {
      await api.deleteBrand(brand.slug, typed);
      try { window.localStorage.removeItem("reelhub.brand"); } catch { /* private mode */ }
      window.location.hash = "#/";
      window.location.reload();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <Section id="set-danger" title="Delete this brand" intro="Nothing is erased. The brand folder, its reels, its data and its character folder are moved to platform/data/trash/. The brand's Instagram login stays where it is unless it can be moved with them. The last brand cannot be deleted, and a brand with a running job is refused.">
      <Row label={`Type "${brand.slug}" to confirm`} htmlFor="del-slug" {...(error ? { problem: error } : {})}>
        <input id="del-slug" type="text" value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
        <p><button type="button" className="btn danger" disabled={typed !== brand.slug || busy} onClick={() => void del()}>{busy ? "Moving to the trash" : "Delete brand"}</button></p>
      </Row>
    </Section>
  );
}
