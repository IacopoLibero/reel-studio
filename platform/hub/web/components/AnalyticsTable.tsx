import { useMemo, useState } from "react";
import type { MediaRecord, Metrics } from "../../src/analytics/schemas";

type Key = keyof Metrics | "postedAt";
const COLS: [Key, string][] = [["postedAt", "Posted"], ["plays", "Plays"], ["reach", "Reach"], ["saves", "Saves"], ["shares", "Shares"], ["likes", "Likes"], ["comments", "Comments"], ["avgWatchMs", "Avg watch"]];
const num = (v: number | undefined) => (v === undefined ? "n/a" : String(v));
const secs = (v: number | undefined) => (v === undefined ? "n/a" : `${(v / 1000).toFixed(1)} s`);
const value = (r: MediaRecord, k: Key): number => (k === "postedAt" ? Date.parse(r.postedAt) : r.metrics[k] ?? -1);
const NOTE: Record<MediaRecord["insights"], string> = { ok: "", partial: "some metrics missing", too_early: "too early", none: "no insights" };

export function ReelsTable({ reels }: { reels: MediaRecord[] }) {
  const [key, setKey] = useState<Key>("postedAt");
  const [desc, setDesc] = useState(true);
  const rows = useMemo(() => [...reels].sort((a, b) => (value(a, key) - value(b, key)) * (desc ? -1 : 1)), [reels, key, desc]);
  const sort = (k: Key) => { if (k === key) setDesc(!desc); else { setKey(k); setDesc(true); } };
  return (
    <table className="q an">
      <thead><tr>
        <th>Reel</th><th>Opening question</th>
        {COLS.map(([k, l]) => <th key={k} className="num"><button className="thbtn" onClick={() => sort(k)} aria-label={`Sort by ${l}`}>{l}{k === key ? (desc ? " v" : " ^") : ""}</button></th>)}
      </tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td><a href={r.permalink} target="_blank" rel="noreferrer">{r.reel ? `#${r.reel.n}` : "open"}</a>{r.reel?.closing && <span className="badge" style={{ marginLeft: 6 }}>{r.reel.closing}</span>}</td>
            <td>{r.hook || r.captionStart}{NOTE[r.insights] && <div className="muted">{NOTE[r.insights]}</div>}</td>
            <td className="num">{new Date(r.postedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
            {COLS.slice(1).map(([k]) => <td key={k} className="num">{k === "avgWatchMs" ? secs(r.metrics.avgWatchMs) : num(r.metrics[k as keyof Metrics])}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
