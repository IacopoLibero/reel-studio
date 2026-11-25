import { useEffect, useState } from "react";
import type { BrandSummary, Job } from "../../src/shared/types";
import { api, carouselFileUrl, getBrand, type Carousel } from "../api";
import { routeHash, useAutoReload, useLoad } from "../hooks";
import { SlotPicker } from "../components/SlotPicker";
import { EmptyState } from "../components/EmptyState";
import { JobCard } from "../components/JobCard";

export const STYLES = [
  { id: "2d", name: "2D", text: "Drawn in Remotion: real product screens in tablet and phone frames, paper, soft shadows, a colourful background that continues across the slides. Fast, about ten minutes." },
  { id: "3d", name: "3D", text: "A Blender scene (lights, shadows, depth of field, real materials) as wide as all the slides, cut in slides, with the text over it. Objects cross from one slide to the next. Slower, about half an hour." },
] as const;

const running = (jobs: Job[]): Job[] => jobs.filter((j) => j.type === "carousel.make" && (j.status === "queued" || j.status === "running"));

export function CarouselsPage({ jobs, brand }: { jobs: Job[]; brand: BrandSummary }) {
  const { data, error, reload } = useLoad(api.carousels);
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState<"2d" | "3d">("2d");
  const [slides, setSlides] = useState(5);
  const [closing, setClosing] = useState<"A" | "B">("B");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [picking, setPicking] = useState<Carousel | null>(null);
  // A scheduled carousel becomes posted when its time passes, so the list is read again now and then and when an Instagram job changes.
  const igKey = jobs.filter((j) => j.type.startsWith("instagram.")).map((j) => `${j.id}:${j.status}`).join(",");
  useAutoReload(reload, [igKey], 30);
  const active = running(jobs);
  const doneCount = jobs.filter((j) => j.type === "carousel.make" && j.status === "done").length;
  useEffect(reload, [doneCount, active.length]);
  const make = () => {
    setBusy(true); setMsg(null);
    api.createJob("carousel.make", { topic: topic.trim(), style, slides, closing })
      .then(() => { setTopic(""); setMsg("Started. It appears below when it is done."); })
      .catch((e: Error) => setMsg(e.message))
      .finally(() => setBusy(false));
  };
  const list = [...(data ?? [])].reverse();
  return (
    <>
      <h1>Carousels</h1>
      <p className="sub">Swipe posts for Instagram, 1080 × 1350. Say what a carousel is about, choose 2D or 3D, and the AI plans it with the Ootto carousel skills, builds the slides and writes the caption.</p>
      {error && <p className="error">{error}</p>}
      <div className="card">
        <label htmlFor="car-topic">What is the carousel about?</label>
        <textarea id="car-topic" rows={2} value={topic} maxLength={600} placeholder="Changed a price? Stop reprinting every menu." onChange={(e) => setTopic(e.target.value)} />
        <div className="radios" role="radiogroup" aria-label="Style of the carousel" style={{ margin: "10px 0" }}>
          {STYLES.map((s) => (
            <label key={s.id} className="radio" style={{ alignItems: "flex-start" }}>
              <input type="radio" name="car-style" checked={style === s.id} onChange={() => setStyle(s.id)} />
              <span><strong>{s.name}</strong> <span className="muted">{s.text}</span></span>
            </label>
          ))}
        </div>
        <div className="row wrap">
          <label htmlFor="car-slides" className="muted" style={{ display: "inline", margin: 0 }}>Slides</label>
          <select id="car-slides" style={{ width: "auto" }} value={slides} onChange={(e) => setSlides(Number(e.target.value))}>{[4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          <label htmlFor="car-closing" className="muted" style={{ display: "inline", margin: "0 0 0 8px" }}>Last slide</label>
          <select id="car-closing" style={{ width: "auto" }} value={closing} onChange={(e) => setClosing(e.target.value as "A" | "B")}>
            <option value="B">Follow for tips</option><option value="A">The brand's offer</option>
          </select>
          <span className="grow" />
          <button type="button" className="btn primary" disabled={busy || topic.trim().length < 5} onClick={make}>{busy ? "Starting" : `Make the ${style.toUpperCase()} carousel`}</button>
        </div>
        {!brand.productDir && <p className="muted" style={{ marginTop: 10 }}>No product folder is set, so the slides will draw the idea. To show the real screens of the product, set its folder in <a href={routeHash(getBrand(), "settings")}>Settings &gt; Product</a>.</p>}
        {msg && <p className="muted" role="status">{msg}</p>}
      </div>
      {active.map((j) => <JobCard key={j.id} job={j} open />)}
      {data && list.length === 0 && active.length === 0 && (
        <EmptyState title="No carousels yet">The first one you make appears here with its slides and caption.</EmptyState>
      )}
      {list.map((c) => (
        <div className="card row reel-row" key={c.key} onClick={(e) => { if (!(e.target as HTMLElement).closest("button, a")) window.location.hash = routeHash(getBrand(), "carousels", c.folder); }}>
          {c.slides[0] ? <img className="thumb wide" loading="lazy" src={carouselFileUrl(c.folder, c.slides[0])} alt="" /> : <div className="thumb" />}
          <div className="grow">
            <div><a href={routeHash(getBrand(), "carousels", c.folder)}><strong>{c.n} · {c.title || c.name}</strong></a> <span className="muted">· {c.brand}</span></div>
            <div className="muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.captionStart || c.topic || "No caption"}</div>
            <div className="chips" style={{ marginTop: 6 }}>
              <span className="badge">{c.style.toUpperCase()}</span><span className="badge">{c.slides.length} slides</span>
              <span className="badge">{c.hasCaption ? "caption" : "no caption"}</span>
              <span className="badge">{c.hasAlt ? "alt texts" : "no alt texts"}</span>
            </div>
          </div>
          <div>
            {c.state === "posted" ? <span className="badge done">Posted {c.schedule?.at}</span>
              : c.state === "scheduled" ? <span className="badge scheduled">Scheduled {c.schedule?.at}</span>
              : c.state === "scheduling" ? <span className="badge running">Scheduling…</span>
              : c.state === "to-schedule" ? <button className="btn primary" onClick={() => setPicking(c)}>To schedule</button>
              : <span className="badge">Not finished</span>}
          </div>
        </div>
      ))}
      {picking && <SlotPicker reel={{ key: `${picking.brand}/carousels/${picking.folder}`, n: picking.n, name: picking.title || picking.name, kind: "carousel" }} onClose={() => { setPicking(null); reload(); }} />}
    </>
  );
}
