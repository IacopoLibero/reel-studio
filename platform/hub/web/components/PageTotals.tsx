import type { PageRow } from "../../src/analytics/page-types";

const show = (v: number | null): string => (v === null ? "n/a" : v.toLocaleString("en-GB"));
const NAMES: Record<string, string> = { instagram: "Instagram", threads: "Threads", tiktok: "TikTok" };

/** Followers now, the change since the oldest reading, and the last day's totals of one page. */
export function PageTotals({ platform, rows }: { platform: string; rows: PageRow[] }) {
  const last = rows.at(-1);
  if (!last) return null;
  const first = rows.find((r) => r.followers !== null);
  const change = first && last.followers !== null && first.followers !== null && first !== last ? last.followers - first.followers : null;
  return (
    <div className="card">
      <strong>{NAMES[platform] ?? platform}</strong> <span className="muted">· {rows.length} reading{rows.length === 1 ? "" : "s"}, last {last.date}</span>
      <div className="stats" style={{ marginTop: 8 }}>
        <div className="card stat"><div className="muted">Followers</div><div className="big">{show(last.followers)}</div>{change !== null && <div className="muted">{change >= 0 ? "+" : ""}{change} since {first?.date}</div>}</div>
        <div className="card stat"><div className="muted">Reach (day)</div><div className="big">{show(last.reach)}</div></div>
        <div className="card stat"><div className="muted">Views (day)</div><div className="big">{show(last.views)}</div></div>
        <div className="card stat"><div className="muted">Profile views (day)</div><div className="big">{show(last.profileViews)}</div></div>
        <div className="card stat"><div className="muted">Accounts engaged (day)</div><div className="big">{show(last.accountsEngaged)}</div></div>
      </div>
    </div>
  );
}
