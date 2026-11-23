import { useEffect, useState } from "react";
import type { BrandSummary, Job } from "../../src/shared/types";
import { EMPTY_CHARACTER_FIELDS, type CharacterFields } from "../../src/shared/character-prompt";
import { api, scoped, type StudioView } from "../api";
import { useLoad } from "../hooks";
import { CharacterPromptBuilder } from "../creator/CharacterPromptBuilder";
import { CharacterChat } from "../creator/CharacterChat";
import { JobCard } from "./JobCard";
import { StudioChat } from "./StudioChat";

const BUILD = "character.build";
const MOVES = "character.moves";

/** Character from a picture (experimental): the AI image prompt, the reference sheet, a first flat 3D version built by Claude and Blender, and your approval. */
export function CharacterStudio({ jobs, brand }: { jobs: Job[]; brand: BrandSummary }) {
  const { data, error, reload } = useLoad<StudioView>(api.studio);
  const [name, setName] = useState("");
  const [fields, setFields] = useState<CharacterFields>({ ...EMPTY_CHARACTER_FIELDS });
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stamp, setStamp] = useState(0);
  const builds = jobs.filter((j) => j.type === BUILD);
  const moveJobs = jobs.filter((j) => j.type === MOVES);
  const active = [...builds, ...moveJobs].some((j) => j.status === "queued" || j.status === "running");
  const doneKey = [...builds, ...moveJobs].filter((j) => j.status === "done").length;
  useEffect(() => { if (data) { setName(data.state.name || brand.character.name); setFields(data.state.fields); } }, [data?.state.updatedAt]);
  useEffect(reload, [active, doneKey]);

  const save = () => api.saveStudioFields(name, fields).catch((e: Error) => setMsg(e.message));
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setMsg(null);
    try { await save(); await api.uploadSheet(f); setStamp(Date.now()); reload(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const build = async () => {
    setBusy(true); setMsg(null);
    try { await save(); await api.createJob(BUILD, notes.trim() ? { notes: notes.trim() } : {}); setNotes(""); setMsg("Started. This can take several minutes. Follow it below."); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const useCharacter = async () => {
    setBusy(true); setMsg(null);
    try {
      if (data?.state.status !== "built") await api.approveCharacter();
      await api.createJob(MOVES, {});
      setMsg("Started. Claude rigs the character and Blender renders every move: this can take a while. Follow it below.");
      reload();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const st = data?.state;
  const hasPreview = (data?.previews.length ?? 0) > 0;

  return (
    <>
      <h2>Character from a picture <span className="badge">experimental</span></h2>
      <div className="warn-box" role="note"><strong>This step needs iteration and may not give a finished character.</strong> Claude plans simple shapes from your sheet and Blender renders a flat preview. Look at the preview and chat with Claude to change it until you like it. Then press Approve and use this character: the moves reels use (talking, waving, expressions) are made and the character becomes the brand's. They are as good as the preview.</div>
      {error && <p className="error">{error}</p>}
      <div className="card">
        <h3>1. Make the reference sheet with an AI image tool</h3>
        <label htmlFor="cs-name">Character name</label>
        <input id="cs-name" type="text" value={name} maxLength={80} placeholder="Bun" onChange={(e) => setName(e.target.value)} onBlur={() => void save()} />
        <CharacterChat ask={api.characterStudioChat} name={name} fields={fields} onFill={(n, f) => { setName(n); setFields(f); void api.saveStudioFields(n, f).catch((e: Error) => setMsg(e.message)); }} />
        <CharacterPromptBuilder brandName={brand.name} colors={brand.colors} fields={fields} onChange={setFields} onBlur={() => void save()} />
      </div>
      <div className="card">
        <h3>2. Upload the sheet</h3>
        <input type="file" aria-label="Reference sheet" accept="image/png,image/jpeg,.png,.jpg,.jpeg" disabled={busy} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
        <p className="muted">PNG or JPG, up to 10 MB. Stored in characters/{brand.slug}/ on this machine.</p>
        {data?.sheet && <img className="sheet-thumb big" alt="Reference sheet" src={`${scoped("/character/studio/sheet")}?v=${stamp}`} />}
      </div>
      {!hasPreview && (
        <div className="card">
          <h3>3. Build the first preview</h3>
          <label htmlFor="cs-notes">Notes for Claude (optional)</label>
          <textarea id="cs-notes" rows={3} value={notes} placeholder="The head is a fork with four tines; keep the red neckerchief." onChange={(e) => setNotes(e.target.value)} />
          <div className="row"><button type="button" className="btn primary" disabled={busy || active || !data?.sheet} title={data?.sheet ? "" : "Upload the sheet first"} onClick={() => void build()}>Build the preview</button></div>
          {msg && <p className="muted" role="status">{msg}</p>}
          {!active && builds.slice(0, 1).map((j) => j.status === "failed" || j.status === "cancelled" ? <p key={j.id} className="error">{j.error ?? "The last build did not finish."}</p> : null)}
        </div>
      )}
      {!hasPreview && builds.filter((j) => j.status === "queued" || j.status === "running").map((j) => <JobCard key={j.id} job={j} open />)}
      {hasPreview && data && (
        <div className="card">
          <h3>3. Preview, then change it by chatting with Claude</h3>
          <div className="previews">{data.previews.map((f) => <figure key={f}><img alt={`Preview ${f}`} src={`${scoped(`/character/studio/previews/${f}`)}?v=${data.state.updatedAt}`} /><figcaption className="muted">{f.replace(".png", "")}</figcaption></figure>)}</div>
          {data.plan?.summary && <p className="muted"><strong>Claude's plan:</strong> {data.plan.summary}{data.plan.limits ? ` Not matched: ${data.plan.limits}` : ""}</p>}
          <StudioChat messages={data.chat} running={builds.find((j) => j.status === "queued" || j.status === "running")} disabled={busy || moveJobs.some((j) => j.status === "queued" || j.status === "running")} onSent={reload} />
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" className="btn primary" disabled={busy || active} onClick={() => void useCharacter()}>{st?.status === "built" ? "Approve and make the moves again" : "Approve and use this character"}</button>
            {st?.status === "built" && <span className="badge done">character in use</span>}
            <span className="muted">Claude then rigs the character and Blender renders idle, talk, wave, point, thumbs up, jump and the expressions. When it is done reels can use it.</span>
          </div>
          {msg && <p className="muted" role="status">{msg}</p>}
        </div>
      )}
      {moveJobs.slice(0, 2).map((j) => <JobCard key={j.id} job={j} open={j.status === "running"} />)}
    </>
  );
}
