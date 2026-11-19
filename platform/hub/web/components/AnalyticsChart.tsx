import type { MediaRecord } from "../../src/analytics/schemas";

const W = 720, H = 200, PAD = { l: 44, r: 12, t: 12, b: 34 };

/** Plays per reel in posting order: bars for plays, a line for reach. Hand-made SVG. */
export function PlaysChart({ reels }: { reels: MediaRecord[] }) {
  const pts = reels.filter((r) => typeof r.metrics.plays === "number");
  if (pts.length === 0) return <p className="muted">No plays to draw yet.</p>;
  const max = Math.max(1, ...pts.map((r) => Math.max(r.metrics.plays ?? 0, r.metrics.reach ?? 0)));
  const step = (W - PAD.l - PAD.r) / pts.length;
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / max);
  const x = (i: number) => PAD.l + step * i + step / 2;
  const line = pts.filter((r) => typeof r.metrics.reach === "number").map((r) => `${x(pts.indexOf(r))},${y(r.metrics.reach ?? 0)}`).join(" ");
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Plays per reel over time" className="chart">
      {ticks.map((t) => <g key={t}><line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--line)" /><text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" className="tick">{t}</text></g>)}
      {pts.map((r, i) => {
        const w = Math.min(36, step * 0.6);
        const top = y(r.metrics.plays ?? 0);
        return (
          <g key={r.id}>
            <rect x={x(i) - w / 2} y={top} width={w} height={H - PAD.b - top} rx={3} fill="var(--accent)"><title>{`${r.hook || r.captionStart}: ${r.metrics.plays} plays`}</title></rect>
            <text x={x(i)} y={top - 4} textAnchor="middle" className="tick">{r.metrics.plays}</text>
            <text x={x(i)} y={H - 18} textAnchor="middle" className="tick">{r.reel ? `#${r.reel.n}` : "?"}</text>
            <text x={x(i)} y={H - 6} textAnchor="middle" className="tick dim">{new Date(r.postedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</text>
          </g>
        );
      })}
      {line && <polyline points={line} fill="none" stroke="var(--ok)" strokeWidth={2} />}
      {pts.filter((r) => typeof r.metrics.reach === "number").map((r) => <circle key={r.id} cx={x(pts.indexOf(r))} cy={y(r.metrics.reach ?? 0)} r={3.5} fill="var(--ok)" />)}
    </svg>
  );
}
