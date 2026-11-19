import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface CollectResult { ok: boolean; stub: boolean; note: string }
type Collector = (opts?: Record<string, unknown>) => Promise<unknown>;

/** Calls the ANALYTICS module's collectAnalytics() when it exists. Without it (or when it throws) the run continues on the data already on disk. */
export async function collectViaAdapter(opts: Record<string, unknown> = {}, loader: () => Promise<{ collectAnalytics?: Collector }> = () => import("../analytics/collector.js" as string)): Promise<CollectResult> {
  if (process.env.HUB_DAILY_FAKE_COLLECTOR === "1") return { ok: true, stub: true, note: "Fake collector (test): no Instagram call was made." };
  let mod: { collectAnalytics?: Collector };
  try { mod = await loader(); } catch { return { ok: false, stub: true, note: "The analytics module is not installed yet: using the data already on disk." }; }
  if (typeof mod.collectAnalytics !== "function") return { ok: false, stub: true, note: "The analytics module has no collectAnalytics(): using the data already on disk." };
  try {
    const r = await mod.collectAnalytics(opts);
    const n = r && typeof r === "object" ? (r as { mediaCount?: unknown; note?: unknown }) : {};
    const note = typeof n.note === "string" ? n.note : typeof n.mediaCount === "number" ? `Fresh snapshot collected: ${n.mediaCount} posts.` : "Fresh snapshot collected.";
    return { ok: true, stub: false, note };
  } catch (e) { return { ok: false, stub: false, note: `Collecting failed (${(e as Error).message.slice(0, 200)}): using the data already on disk.` }; }
}

/** Rows (without the header) of data/analytics/hooks.csv. */
export function hooksRows(dataDir: string): number {
  const f = join(dataDir, "analytics", "hooks.csv");
  if (!existsSync(f)) return 0;
  try { return Math.max(0, readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).length - 1); } catch { return 0; }
}
