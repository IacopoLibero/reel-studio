import { useEffect, useState } from "react";
import type { Job } from "../../src/shared/types";
import { api, carouselFileUrl, getBrand } from "../api";
import { routeHash, useLoad } from "../hooks";
import { JobCard } from "../components/JobCard";

/** One carousel: its slides side by side (swipe order), the caption to copy, the plan, and a way to make it again with a note. */
export function CarouselPage({ folder, jobs }: { folder: string; jobs: Job[] }) {
  const { data, error, reload } = useLoad(() => api.carousel(folder));
  const mine = jobs.filter((j) => (j.type === "carousel.make" && j.params.rerunFolder === folder) || (j.type === "carousel.edit" && j.params.folder === folder));
  const edits = jobs.filter((j) => j.type === "carousel.edit" && j.params.folder === folder);
  const lastEdit = [...edits].filter((j) => j.status === "done" || j.status === "failed").sort((a, b) => Date.parse(b.finishedAt ?? "") - Date.parse(a.finishedAt ?? ""))[0];
  const active = mine.filter((j) => j.status === "queued" || j.status === "running");
  const doneCount = mine.filter((j) => j.status === "done").length;
  useEffect(reload, [doneCount, active.length]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [big, setBig] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [slide, setSlide] = useState(1);
  const [change, setChange] = useState("");
  /** A slide that was drawn again has another size: the address changes and the browser shows the new picture. */
  const stamp = (name: string): number | undefined => c?.files.find((f) => f.name === name)?.size;
  const editSlide = () => {
    setBusy(true); setMsg(null);
    api.createJob("carousel.edit", { folder, slide, message: change.trim() })
      .then(() => { setChange(""); setMsg(`Started: slide ${slide} is changed, the others stay as they are.`); })
      .catch((e: Error) => setMsg(e.message))
      .finally(() => setBusy(false));
  };
  const c = data?.carousel;
  const again = () => {
    if (!c) return;
    setBusy(true); setMsg(null);
    api.createJob("carousel.make", { topic: c.topic || c.title || c.name.replace(/-/g, " "), style: c.style, slides: c.slides.length || 5, closing: "B", rerun: { folder, note: note.trim() } })
      .then(() => { setNote(""); setMsg("Started: the carousel is made again in the same folder."); })
      .catch((e: Error) => setMsg(e.message))
      .finally(() => setBusy(false));
  };
  const copy = () => { if (!c) return; void navigator.clipboard.writeText(c.caption).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }).catch(() => setMsg("Your browser blocked copying: select the caption and copy it.")); };
  return (
    <>
      <p><a href={routeHash(getBrand(), "carousels")}>← Carousels</a></p>
      {error && <p className="error">{error}</p>}
      {c && (
        <>
          <h1>{c.n} · {c.title || c.name}</h1>
          <p className="sub"><span className="badge">{c.style.toUpperCase()}</span> {c.slides.length} slides · 1080 × 1350 · {c.topic}</p>
          <div className="carousel-strip" role="list" aria-label="The slides, in swipe order">
            {c.slides.map((s, i) => <img key={s} role="listitem" alt={`Slide ${i + 1}`} loading="lazy" src={carouselFileUrl(folder, s, stamp(s))} onClick={() => setBig(s)} />)}
          </div>
          {big && <div className="lightbox" role="dialog" aria-label="Slide" onClick={() => setBig(null)}><img alt="Slide" src={carouselFileUrl(folder, big, stamp(big))} /></div>}
          <div className="card">
            <div className="row"><strong className="grow">Caption</strong>
              <button type="button" className="btn" onClick={copy} disabled={!c.caption}>{copied ? "Copied" : "Copy"}</button>
              <a className="btn" href={carouselFileUrl(folder, "caption.md")} download>Download</a></div>
            <pre className="reel-text">{c.caption || "No caption yet."}</pre>
            <p className="muted" style={{ fontSize: 12 }}>To post: download the slides (click one to enlarge, right-click to save), then add them in Instagram in this order. Scheduling a carousel from the Calendar is not available yet.</p>
          </div>
          <div className="card">
            <strong>Slides</strong>
            <ul className="reel-files">{c.slides.map((s) => <li key={s}><a href={carouselFileUrl(folder, s)} download>{s}</a></li>)}</ul>
          </div>
          {c.plan && <details className="card"><summary><strong>Plan</strong></summary><pre className="reel-text">{c.plan}</pre></details>}
          <div className="card">
            <strong>Change one slide</strong>
            <p className="muted" style={{ margin: "4px 0 8px" }}>Pick the slide and say what to change. Only that slide is drawn again; the other slides, the caption and the plan stay as they are (the alt text of the slide is updated if its picture changed). The old slides are kept in the <code>versions</code> folder of the carousel.</p>
            {!c.hasSource && <p className="error" role="status">The files that draw this carousel (the scene and the code) are not in its folder, so one slide cannot be drawn again. Put them back, or press &ldquo;Make it again&rdquo; below: the new build keeps them.</p>}
            <div className="row" role="radiogroup" aria-label="Which slide" style={{ marginBottom: 8 }}>
              {c.slides.map((s, i) => <button key={s} type="button" role="radio" aria-checked={slide === i + 1} className={`btn small${slide === i + 1 ? " primary" : ""}`} disabled={active.length > 0 || !c.hasSource} onClick={() => setSlide(i + 1)}>Slide {i + 1}</button>)}
            </div>
            {active.filter((j) => j.type === "carousel.edit").map((j) => <JobCard key={j.id} job={j} open />)}
            <div className="row" style={{ alignItems: "flex-end" }}>
              <textarea className="grow" rows={2} value={change} disabled={active.length > 0 || !c.hasSource} aria-label={`What should change on slide ${slide}`} placeholder="Shorter title, move the phone to the right." onChange={(e) => setChange(e.target.value)} />
              <button type="button" className="btn primary" disabled={busy || active.length > 0 || !c.hasSource || change.trim().length < 3} onClick={editSlide}>Change slide {slide}</button>
            </div>
            {lastEdit && active.length === 0 && <p className={lastEdit.status === "failed" ? "error" : "muted"} role="status">{lastEdit.status === "failed" ? `Slide ${String(lastEdit.params.slide)} was not changed: ${lastEdit.error ?? "the change failed"}` : String(lastEdit.result.summary ?? "Done.")}</p>}
          </div>
          <div className="card">
            <strong>Make it again</strong>
            <p className="muted" style={{ margin: "4px 0 8px" }}>Say what to change; the AI rebuilds the carousel in the same folder and replaces the slides, the caption and the plan.</p>
            {active.filter((j) => j.type === "carousel.make").map((j) => <JobCard key={j.id} job={j} open />)}
            <div className="row" style={{ alignItems: "flex-end" }}>
              <textarea className="grow" rows={2} value={note} disabled={active.length > 0} aria-label="What should change in this carousel" placeholder="Bigger titles, make slide 3 about the kitchen screen." onChange={(e) => setNote(e.target.value)} />
              <button type="button" className="btn primary" disabled={busy || active.length > 0 || !note.trim()} onClick={again}>Make it again</button>
            </div>
            {msg && <p className="muted" role="status">{msg}</p>}
          </div>
        </>
      )}
    </>
  );
}
