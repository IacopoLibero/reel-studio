import { useEffect, useState } from "react";
import type { Job, Reel } from "../../src/shared/types";
import { api, getBrand, scoped } from "../api";
import { useLoad } from "../hooks";
import { SlotPicker } from "../components/SlotPicker";
import { EmptyState } from "../components/EmptyState";

export function ReelsPage({ jobs }: { jobs: Job[] }) {
  const { data, error, reload } = useLoad(api.reels);
  const [picking, setPicking] = useState<Reel | null>(null);
  const doneCount = jobs.filter((j) => j.type === "instagram.schedule" && j.status === "done").length;
  useEffect(reload, [doneCount, jobs.filter((j) => j.type === "instagram.schedule" && j.status !== "done" && j.status !== "failed" && j.status !== "cancelled").length]);
  const reels = [...(data ?? [])].reverse();
  return (
    <>
      <h1>Reels</h1>
      <p className="sub">Every reel folder, its files and its Instagram schedule.</p>
      {error && <p className="error">{error}</p>}
      {data && reels.length === 0 && (
        <EmptyState title="No reels yet" action={<a className="btn primary" href={`#/${getBrand()}/factory`}>Go to the Factory</a>}>
          Reels you make for this brand appear here with their video, caption and cover, and you schedule them from this page. The first one starts in the Factory: pick a question and send it to be made.
        </EmptyState>
      )}
      {reels.map((r) => {
        const ready = !!r.mp4 && r.hasCaption && r.hasCover;
        return (
          <div className="card row" key={r.key}>
            {r.hasCover ? <img className="thumb" loading="lazy" src={scoped(`/reels/file?key=${encodeURIComponent(r.key)}&kind=cover`)} alt="" /> : <div className="thumb" />}
            <div className="grow">
              <div><strong>{r.n} · {r.name}</strong> <span className="muted">· {r.brand}</span></div>
              <div className="muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.captionStart || "No caption"}</div>
              <div className="chips" style={{ marginTop: 6 }}>
                <span className="badge">{r.mp4 ? "MP4" : "no MP4"}</span>
                <span className="badge">{r.hasCaption ? "caption" : "no caption"}</span>
                <span className="badge">{r.hasCover ? "cover" : "no cover"}</span>
              </div>
            </div>
            {r.schedule?.status === "posted" ? <span className="badge done">Posted {r.schedule.at}</span>
              : r.schedule ? <span className="badge scheduled">Scheduled {r.schedule.at}</span>
              : r.scheduling ? <span className="badge running">In queue</span>
              : <button className="btn primary" disabled={!ready} title={ready ? "" : "Needs MP4, caption and cover"} onClick={() => setPicking(r)}>Schedule</button>}
          </div>
        );
      })}
      {picking && <SlotPicker reel={picking} onClose={() => { setPicking(null); reload(); }} />}
    </>
  );
}
