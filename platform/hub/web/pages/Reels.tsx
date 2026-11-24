import { useState } from "react";
import type { Job, Reel } from "../../src/shared/types";
import { api, getBrand, scoped } from "../api";
import { routeHash, useAutoReload, useLoad } from "../hooks";
import { SlotPicker } from "../components/SlotPicker";
import { EmptyState } from "../components/EmptyState";

export function ReelsPage({ jobs }: { jobs: Job[] }) {
  const { data, error, reload } = useLoad(api.reels);
  const [picking, setPicking] = useState<Reel | null>(null);
  // Any Instagram job (schedule, move, delete) changes a banner: reload when one starts or ends, and every 30 s (a scheduled post becomes posted when its time passes).
  const igKey = jobs.filter((j) => j.type.startsWith("instagram.")).map((j) => `${j.id}:${j.status}`).join(",");
  useAutoReload(reload, [igKey], 30);
  // Episodes of a series are shown in the Series page, not among the single reels.
  const reels = [...(data ?? [])].reverse().filter((r) => !r.series);
  const hidden = (data ?? []).length - reels.length;
  return (
    <>
      <h1>Reels</h1>
      <p className="sub">Every reel folder, its files and its Instagram schedule. Click a reel to watch it and change it by talking to Claude.</p>
      {hidden > 0 && <p className="muted">{hidden} reel{hidden === 1 ? "" : "s"} of a series {hidden === 1 ? "is" : "are"} in <a href={`#/${getBrand()}/series`}>Series</a>.</p>}
      {error && <p className="error">{error}</p>}
      {data && reels.length === 0 && (
        <EmptyState title="No reels yet" action={<a className="btn primary" href={`#/${getBrand()}/factory`}>Go to the Factory</a>}>
          Reels you make for this brand appear here with their video, caption and cover, and you schedule them from this page. The first one starts in the Factory: pick a question and send it to be made.
        </EmptyState>
      )}
      {reels.map((r) => {
        const ready = !!r.mp4 && r.hasCaption && r.hasCover;
        return (
          <div className="card row reel-row" key={r.key} onClick={(e) => { if (!(e.target as HTMLElement).closest("button, a")) window.location.hash = routeHash(getBrand(), "reels", r.folder); }}>
            {r.hasCover ? <img className="thumb" loading="lazy" src={scoped(`/reels/file?key=${encodeURIComponent(r.key)}&kind=cover`)} alt="" /> : <div className="thumb" />}
            <div className="grow">
              <div><a href={routeHash(getBrand(), "reels", r.folder)}><strong>{r.n} · {r.name}</strong></a> <span className="muted">· {r.brand}</span></div>
              <div className="muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.captionStart || "No caption"}</div>
              <div className="chips" style={{ marginTop: 6 }}>
                <span className="badge">{r.mp4 ? "MP4" : "no MP4"}</span>
                <span className="badge">{r.hasCaption ? "caption" : "no caption"}</span>
                <span className="badge">{r.hasCover ? "cover" : "no cover"}</span>
              </div>
            </div>
            {r.state === "posted" ? <span className="badge done">Posted {r.schedule?.at}</span>
              : r.state === "scheduled" ? <span className="badge scheduled">Scheduled {r.schedule?.at}</span>
              : r.state === "scheduling" ? <span className="badge running">Scheduling…</span>
              : r.state === "to-schedule" ? <button className="btn primary" disabled={!ready} onClick={() => setPicking(r)}>To schedule</button>
              : <span className="badge" title="Needs MP4, caption and cover">Not finished</span>}
          </div>
        );
      })}
      {picking && <SlotPicker reel={picking} onClose={() => { setPicking(null); reload(); }} />}
    </>
  );
}
