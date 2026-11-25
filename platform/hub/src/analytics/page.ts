import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ToolRunner } from "./composio.js";
import type { PageRow } from "./page-types.js";
import { analyticsDir } from "./store.js";

export const PAGE_HEADER = ["date", "followers", "following", "posts", "reach", "views", "profile_views", "accounts_engaged"] as const;
export type { PageRow } from "./page-types.js";
const PAGE_METRICS = ["reach", "views", "profile_views", "accounts_engaged"] as const;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The first number found under `key`, looking through nested objects (Composio wraps the answer a few levels deep). */
function findNumber(v: unknown, key: string, depth = 0): number | null {
  if (depth > 5 || !v || typeof v !== "object") return null;
  const o = obj(v);
  if (key in o && num(o[key]) !== null) return num(o[key]);
  for (const child of Object.values(o)) {
    const n = findNumber(child, key, depth + 1);
    if (n !== null) return n;
  }
  return null;
}

/** The value of one account insight: `total_value.value`, or the last of `values`. */
export function insightValue(raw: unknown, name: string): number | null {
  const list = (function find(v: unknown, d: number): unknown[] {
    if (d > 5 || !v || typeof v !== "object") return [];
    const o = obj(v);
    if (Array.isArray(o.data)) return o.data;
    return Object.values(o).flatMap((c) => find(c, d + 1));
  })(raw, 0);
  for (const item of list) {
    const o = obj(item);
    if (o.name !== name) continue;
    const total = num(obj(o.total_value).value);
    if (total !== null) return total;
    const values = Array.isArray(o.values) ? o.values : [];
    return num(obj(values.at(-1)).value);
  }
  return null;
}

const dayOf = (d: Date): string => d.toISOString().slice(0, 10);

/** Reads the page's followers (INSTAGRAM_GET_USER_INFO) and yesterday's totals (INSTAGRAM_GET_USER_INSIGHTS). A tool that fails leaves its numbers null. */
export async function collectPage(run: ToolRunner, igUserId: string, now: Date, log: (l: string) => void = () => undefined): Promise<PageRow> {
  const row: PageRow = { date: dayOf(now), followers: null, following: null, posts: null, reach: null, views: null, profileViews: null, accountsEngaged: null };
  try {
    const info = await run("INSTAGRAM_GET_USER_INFO", { ig_user_id: igUserId || "me", fields: "followers_count,follows_count,media_count" });
    if (obj(info).successful === true) {
      return { ...row, followers: findNumber(info, "followers_count"), following: findNumber(info, "follows_count"), posts: findNumber(info, "media_count"), ...(await insights(run, igUserId, now, log)) };
    }
    log("Page followers not read: Instagram refused the profile call.");
  } catch (e) { log(`Page followers not read: ${(e as Error).message.slice(0, 160)}`); }
  return { ...row, ...(await insights(run, igUserId, now, log)) };
}

async function insights(run: ToolRunner, igUserId: string, now: Date, log: (l: string) => void): Promise<Pick<PageRow, "reach" | "views" | "profileViews" | "accountsEngaged">> {
  const since = dayOf(new Date(now.getTime() - 2 * 86400_000));
  const until = dayOf(new Date(now.getTime() - 86400_000));
  const out: Pick<PageRow, "reach" | "views" | "profileViews" | "accountsEngaged"> = { reach: null, views: null, profileViews: null, accountsEngaged: null };
  try {
    // One call for all four metrics; if Instagram refuses the set, each one is tried alone.
    const all = await run("INSTAGRAM_GET_USER_INSIGHTS", { ig_user_id: igUserId || "me", metric: [...PAGE_METRICS], period: "day", metric_type: "total_value", since, until });
    const read = (raw: unknown) => ({ reach: insightValue(raw, "reach"), views: insightValue(raw, "views"), profileViews: insightValue(raw, "profile_views"), accountsEngaged: insightValue(raw, "accounts_engaged") });
    if (obj(all).successful === true) return read(all);
    let acc = out;
    for (const m of PAGE_METRICS) {
      const one = await run("INSTAGRAM_GET_USER_INSIGHTS", { ig_user_id: igUserId || "me", metric: [m], period: "day", metric_type: "total_value", since, until });
      if (obj(one).successful === true) { const r = read(one); acc = { reach: acc.reach ?? r.reach, views: acc.views ?? r.views, profileViews: acc.profileViews ?? r.profileViews, accountsEngaged: acc.accountsEngaged ?? r.accountsEngaged }; }
    }
    return acc;
  } catch (e) { log(`Page totals not read: ${(e as Error).message.slice(0, 160)}`); return out; }
}

const cellOf = (n: number | null): string => (n === null ? "" : String(n));
const toLine = (r: PageRow): string => [r.date, r.followers, r.following, r.posts, r.reach, r.views, r.profileViews, r.accountsEngaged].map((v) => (typeof v === "number" ? cellOf(v) : v ?? "")).join(",");

export const pageFile = (dataDir: string, platform: string): string => join(analyticsDir(dataDir), "pages", `${platform}.csv`);

/** Reads a page history, oldest first. */
export function readPageRows(dataDir: string, platform: string): PageRow[] {
  const file = pageFile(dataDir, platform);
  if (!existsSync(file)) return [];
  const n = (s: string | undefined): number | null => (s === undefined || s === "" || !Number.isFinite(Number(s)) ? null : Number(s));
  return readFileSync(file, "utf8").split("\n").slice(1).filter(Boolean).map((l) => {
    const c = l.split(",");
    return { date: c[0] ?? "", followers: n(c[1]), following: n(c[2]), posts: n(c[3]), reach: n(c[4]), views: n(c[5]), profileViews: n(c[6]), accountsEngaged: n(c[7]) };
  });
}

/** Writes the row of its date (a second reading on the same day replaces the first). Returns the history. */
export function appendPageRow(dataDir: string, platform: string, row: PageRow): PageRow[] {
  const rows = [...readPageRows(dataDir, platform).filter((r) => r.date !== row.date), row].sort((a, b) => a.date.localeCompare(b.date));
  const file = pageFile(dataDir, platform);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(`${file}.tmp`, `${[PAGE_HEADER.join(","), ...rows.map(toLine)].join("\n")}\n`);
  renameSync(`${file}.tmp`, file);
  return rows;
}
