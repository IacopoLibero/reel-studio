import { useState } from "react";
import { api, type CreatorOptions, type ImportPreview } from "../api";
import { Card } from "./fields";
import { Extras } from "./Extras";
import { brandToDraft } from "./draft";
import { emptyExtras, extrasProblems, extrasToRequest, toBase64, type ExtrasState } from "./extras";
import { Row } from "../components/SettingsParts";
import { CreateStatus, useCreate, type Created } from "./useCreate";

const SKIP = /(^|\/)(node_modules|\.git)(\/|$)/;

/** Entry 3: a brand folder or zip with brand.json (to move a brand between machines). Nothing existing is ever overwritten. */
export function ImportEntry({ options, onCreated }: { options: CreatorOptions; onCreated: (c: Created) => void }) {
  const [pre, setPre] = useState<ImportPreview | null>(null);
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extras, setExtras] = useState<ExtrasState>(emptyExtras);
  const create = useCreate(onCreated);

  const accept = (r: ImportPreview) => { setPre(r); setSlug(r.preview.brand.slug); setError(null); };
  const run = async (fn: () => Promise<ImportPreview>) => { setBusy(true); setError(null); setPre(null); try { accept(await fn()); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };

  const onZip = (f: File | undefined) => { if (f) void run(() => api.importZip(f)); };
  const onFolder = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    void run(async () => {
      const files = [...list].filter((f) => !SKIP.test((f as File & { webkitRelativePath?: string }).webkitRelativePath ?? f.name));
      if (files.length > 300) throw new Error("This folder has more than 300 files. Zip only the brand folder, or remove the extras.");
      const out = [];
      for (const f of files) out.push({ path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, data: await toBase64(f) });
      return api.importFolder(out);
    });
  };

  const brand = pre ? { ...pre.preview.brand, slug } : null;
  const clash = options.slugs.includes(slug);
  const bad = !!slug && !/^[a-z0-9][a-z0-9-]{0,39}$/.test(slug);
  const problems = extrasProblems(extras, { hideLogo: true, hideVoice: true });
  const d = brand ? brandToDraft(brand) : null;

  return (
    <>
      <Card title="Choose a brand folder or a zip" intro="It must hold brand.json at the top. Imported: brand.json, style.md, reel-questions.md, the logo (logo.png or logo.svg) and the voice files. Anything else is ignored. Files up to 25 MB each, 40 MB in all.">
        <Row label="A zip file" htmlFor="im-zip"><input id="im-zip" type="file" accept=".zip,application/zip" disabled={busy} onChange={(e) => { onZip(e.target.files?.[0]); e.target.value = ""; }} /></Row>
        <Row label="Or a folder" htmlFor="im-dir" help="Your browser asks to upload the folder's files to this hub.">
          <input id="im-dir" type="file" disabled={busy} {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} multiple onChange={(e) => { onFolder(e.target.files); e.target.value = ""; }} />
        </Row>
        {busy && <p className="muted">Reading the files</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </Card>
      {pre && brand && d && (
        <>
          <Card title="What will be imported">
            <Row label="Brand"><strong>{d.name}</strong> <span className="muted">{d.website}</span>
              <div className="swatches">{Object.values(d.colors).map((x) => <span key={x} title={x} style={{ background: x }} />)}</div>
              <p className="muted">Fonts {d.fonts.headline} and {d.fonts.body}. Reels in {d.language}.</p></Row>
            <Row label="Slug" help="Never an existing one: a taken slug was already replaced. You can change it." {...(clash ? { problem: `"${slug}" is already used.` } : bad ? { problem: "Lowercase letters, digits and dashes." } : {})}>
              <input type="text" aria-label="Slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
            </Row>
            <Row label="Files">{[pre.preview.styleMd && "style.md", pre.preview.questions && "reel-questions.md", pre.preview.logo && `logo.${pre.preview.logo}`, pre.preview.voice && "voice sample"].filter(Boolean).join(", ") || "brand.json only"}</Row>
            {pre.preview.warnings.length > 0 && <ul className="warn-box">{pre.preview.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          </Card>
          <Extras value={extras} onChange={setExtras} options={options} brandName={d.name} colors={d.colors} problems={problems} scope={{ hideLogo: true, hideVoice: true }} />
          <div className="create-bar"><span className="muted">Creates brand/{slug}/ from this folder.</span><span className="grow" />
            <button type="button" className="btn primary" disabled={create.busy || clash || bad || !slug || Object.keys(problems).length > 0} onClick={() => void create.start({ source: "import", brand, importId: pre.importId, ...extrasToRequest(extras, { hideLogo: true, hideVoice: true }) })}>{create.busy ? "Creating" : "Create brand"}</button></div>
          <CreateStatus job={create.job} error={create.error} />
        </>
      )}
    </>
  );
}
