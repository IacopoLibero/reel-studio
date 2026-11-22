import { useCallback, useEffect, useState } from "react";
import type { Job } from "../src/shared/types";
import { api } from "./api";

/** Jobs of one brand, kept live over SSE (EventSource sends the login cookie). The event stream carries every brand's jobs; others are ignored. */
export function useJobs(brand: string): Job[] {
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    let alive = true;
    setJobs([]);
    const load = () => api.jobs().then((j) => alive && setJobs(j)).catch(() => undefined);
    load();
    const es = new EventSource("/api/events");
    es.addEventListener("job", (ev) => {
      const job = JSON.parse((ev as MessageEvent).data) as Job;
      if (job.brand !== brand) return;
      setJobs((cur) => (cur.some((j) => j.id === job.id) ? cur.map((j) => (j.id === job.id ? job : j)) : [job, ...cur]));
    });
    es.onerror = () => { load(); };
    return () => { alive = false; es.close(); };
  }, [brand]);
  return jobs;
}

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    fn().then((d) => { if (alive) { setData(d); setError(null); } }).catch((e: Error) => alive && setError(e.message));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, ...deps]);
  return { data, error, reload: useCallback(() => setN((x) => x + 1), []) };
}

/** The pages of a brand, in the order of the nav. "new" is the brand creator (not a brand page). */
export const NEW_BRAND = "new";
const LAST_BRAND_KEY = "reelhub.brand";

export interface Route { brand: string | null; page: string | null; /** The thing a page shows alone: a reel folder on the Reels page. */ item: string | null }

/** `#/<brand>/<page>` or `#/<brand>/<page>/<item>`. `#/<page>` (an old link) has no brand; `#/new` is the creator. */
export function parseRoute(hash: string, pages: readonly string[]): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [a, b, c] = parts;
  if (a === NEW_BRAND) return { brand: NEW_BRAND, page: null, item: null };
  if (a && !b && pages.includes(a)) return { brand: null, page: a, item: null };
  let item: string | null = null;
  if (c) { try { item = decodeURIComponent(c); } catch { item = c; } }
  return { brand: a ?? null, page: b ?? null, item };
}

export const routeHash = (brand: string, page: string, item?: string): string => `#/${brand}/${page}${item ? `/${encodeURIComponent(item)}` : ""}`;
export const rememberedBrand = (): string | null => { try { return window.localStorage.getItem(LAST_BRAND_KEY); } catch { return null; } };
export const rememberBrand = (slug: string): void => { try { window.localStorage.setItem(LAST_BRAND_KEY, slug); } catch { /* private mode */ } };

export function useRoute(pages: readonly string[]): Route {
  const read = () => parseRoute(window.location.hash, pages);
  const [r, setR] = useState(read);
  useEffect(() => {
    const on = () => setR(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  });
  return r;
}

/** Fired on `window` after something that the brand list shows (colours, logo) was saved: the shell reads the list again. */
export const BRANDS_CHANGED = "reelhub:brands-changed";
export const announceBrandsChanged = (): void => { window.dispatchEvent(new Event(BRANDS_CHANGED)); };
