import { brandCtx } from "../brands/context.js";
import type { BrandRegistry } from "../brands/registry.js";
import type { DailyDeps } from "./deps.js";
import { startDaily } from "./service.js";

export interface DailyLoops {
  /** Starts the loop of a brand that has none yet (a brand created while the hub runs). Safe to call again. */
  ensure: (slug: string) => boolean;
  slugs: () => string[];
  /** One check of a brand's loop now (the loop itself checks every 5 minutes). Null for a brand without a loop. */
  tick: (slug: string) => Promise<unknown> | null;
  stop: () => void;
}

/**
 * One daily loop per brand, each with its own switch and earliest time (the brand's settings), plan folder and notifications.
 * The connectivity and heavy-job gates are the same code and read the same job queue, so they are shared in effect.
 * The registry is re-read every minute, so a brand made by the creator or by hand gets its loop without a restart.
 */
export function startDailyLoops(brands: BrandRegistry, make: (d: DailyDeps["brand"]) => DailyDeps, start: typeof startDaily = startDaily, syncMs = 60_000): DailyLoops {
  const running = new Map<string, { stop: () => void; tick: () => Promise<unknown> }>();
  const ensure = (slug: string): boolean => {
    if (running.has(slug)) return false;
    const ctx = brandCtx(brands, slug);
    if (!ctx) return false;
    running.set(slug, start(make(ctx)));
    return true;
  };
  const sync = () => {
    for (const slug of brands.slugs()) ensure(slug);
    for (const [slug, loop] of running) if (!brands.has(slug)) { loop.stop(); running.delete(slug); }
  };
  sync();
  const timer = setInterval(sync, syncMs);
  timer.unref();
  return { ensure, slugs: () => [...running.keys()], tick: (slug) => running.get(slug)?.tick() ?? null, stop: () => { clearInterval(timer); for (const l of running.values()) l.stop(); running.clear(); } };
}
