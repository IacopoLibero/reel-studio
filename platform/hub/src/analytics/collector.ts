import { loadReelRefs } from "../calendar/service.js";
import { toLocal } from "../calendar/merge.js";
import { readBrandQuestions } from "../factory/service.js";
import { cliRunner, type ToolRunner } from "./composio.js";
import { toHooksCsv } from "./csv.js";
import { AnalyticsError } from "./errors.js";
import { captionStart, cleanHook, matchMedia } from "./match.js";
import { classifyFailure, parseInsights, parseMediaPage, unsupportedMetric, type RawMedia } from "./parse.js";
import { REEL_GRAPH_METRICS, type MediaRecord, type Metrics, type Snapshot } from "./schemas.js";
import { writeHooksCsv, writeSnapshot } from "./store.js";

export type { ToolRunner } from "./composio.js";

export interface CollectOpts {
  root: string;
  /** The brand's reels and questions are read, and the files are written to its data folder. */
  brand: string;
  dataDir: string;
  igUserId: string;
  timezone: string;
  now?: Date;
  /** Pause between Graph calls, to stay well inside the rate limits. */
  delayMs?: number;
  /** Called with a short status line, for job logs. */
  onLog?: (line: string) => void;
}
export interface CollectResult { snapshotPath: string; csvPath: string; mediaCount: number }

const PAGE = 100;
const MAX_PAGES = 5;
const LIST_FIELDS = "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count";
const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

async function listMedia(run: ToolRunner, o: CollectOpts): Promise<RawMedia[]> {
  const all: RawMedia[] = [];
  let after: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = parseMediaPage(await run("INSTAGRAM_GET_IG_USER_MEDIA", { ig_user_id: o.igUserId, limit: PAGE, fields: LIST_FIELDS, ...(after ? { after } : {}) }));
    all.push(...page.media);
    if (page.media.length < PAGE || !page.after) break;
    after = page.after;
    await sleep(o.delayMs ?? 0);
  }
  return all;
}

interface Insights { metrics: Metrics; skipped: string[]; state: MediaRecord["insights"]; warning?: string }

/** Insights of one reel: all metrics in one call; when Instagram refuses some, one call per metric and the refused ones are skipped. */
async function readInsights(run: ToolRunner, id: string, delayMs: number): Promise<Insights> {
  const call = (metric: string[]) => run("INSTAGRAM_GET_IG_MEDIA_INSIGHTS", { ig_media_id: id, metric });
  const first = await call([...REEL_GRAPH_METRICS]);
  if ((first as { successful?: unknown }).successful === true) return { metrics: parseInsights(first), skipped: [], state: "ok" };
  const f = classifyFailure(first);
  if (f.kind === "connection") parseMediaPage(first); // throws the connection error with the fix
  if (f.kind === "too_early") return { metrics: {}, skipped: [], state: "too_early" };
  if (f.kind === "rate_limit") return { metrics: {}, skipped: [], state: "none", warning: "Instagram rate limit reached: some reels have no insights yet. Try again later." };
  if (f.kind === "other") return { metrics: {}, skipped: [], state: "none", warning: `Insights failed for one reel: ${f.message.slice(0, 160)}` };

  let metrics: Metrics = {};
  const skipped: string[] = [];
  const known = unsupportedMetric(f.message);
  for (const m of REEL_GRAPH_METRICS) {
    if (m === known) { skipped.push(m); continue; }
    await sleep(delayMs);
    const r = await call([m]);
    if ((r as { successful?: unknown }).successful === true) { metrics = { ...metrics, ...parseInsights(r) }; continue; }
    const rf = classifyFailure(r);
    if (rf.kind === "rate_limit") return { metrics, skipped, state: Object.keys(metrics).length ? "partial" : "none", warning: "Instagram rate limit reached while reading metrics." };
    if (rf.kind === "connection") parseMediaPage(r);
    skipped.push(m);
  }
  const got = Object.keys(metrics).length;
  return { metrics, skipped, state: got === 0 ? "none" : skipped.length ? "partial" : "ok" };
}

function record(m: RawMedia, ins: Insights | null, reels: ReturnType<typeof loadReelRefs>, questions: Map<string, string>): MediaRecord {
  const ref = matchMedia(m.caption, reels);
  const base: Metrics = { ...(m.likes !== null ? { likes: m.likes } : {}), ...(m.comments !== null ? { comments: m.comments } : {}) };
  return {
    id: m.id, permalink: m.permalink, captionStart: captionStart(m.caption),
    hook: (ref && questions.get(ref.key)) || cleanHook(m.caption),
    postedAt: m.postedAt, mediaType: m.mediaType, productType: m.productType,
    reel: ref ? { key: ref.key, n: ref.n, name: ref.name, closing: ref.closing } : null,
    metrics: { ...base, ...(ins?.metrics ?? {}) },
    insights: ins?.state ?? "none", skipped: ins?.skipped ?? [],
  };
}

/** Reads the media list and the insights of every reel (GET calls only), then writes the snapshot and hooks.csv. */
export async function collectInto(run: ToolRunner, o: CollectOpts): Promise<CollectResult> {
  if (!o.igUserId) throw new AnalyticsError("This brand has no Instagram user id: add it to the brand (Settings or brand.json).", "runner");
  const log = o.onLog ?? (() => undefined);
  const now = o.now ?? new Date();
  const delay = o.delayMs ?? 0;
  const raw = await listMedia(run, o);
  const reelsRaw = raw.filter((m) => m.productType === "REELS");
  log(`${raw.length} posts found, ${reelsRaw.length} reels`);

  const refs = loadReelRefs(o.root, o.dataDir, o.brand);
  const questions = new Map(readBrandQuestions(o.dataDir, o.brand).filter((q) => q.folder).map((q) => [`${q.brand}/${q.folder}`, q.question]));
  const warnings: string[] = [];
  const insights = new Map<string, Insights>();
  let limited = false;
  for (const m of reelsRaw) {
    if (limited) break;
    await sleep(delay);
    const ins = await readInsights(run, m.id, delay);
    insights.set(m.id, ins);
    if (ins.warning) { warnings.push(ins.warning); if (/rate limit/i.test(ins.warning)) limited = true; }
    log(`insights ${insights.size}/${reelsRaw.length}: ${ins.state}`);
  }
  const media = raw.map((m) => record(m, insights.get(m.id) ?? null, refs, questions));
  const snap: Snapshot = { version: 1, collectedAt: now.toISOString(), igUserId: o.igUserId, warnings: [...new Set(warnings)], media };
  const date = toLocal(now.toISOString(), o.timezone).date;
  return { snapshotPath: writeSnapshot(o.dataDir, date, snap), csvPath: writeHooksCsv(o.dataDir, toHooksCsv(media)), mediaCount: media.length };
}

/** Stable interface for the daily loop: a fresh snapshot and hooks.csv of one brand. Read-only on Instagram. */
export async function collectAnalytics(o: CollectOpts): Promise<CollectResult> {
  if (!o.igUserId) throw new AnalyticsError("This brand has no Instagram user id: add it to the brand (Settings or brand.json).", "runner");
  return collectInto(cliRunner(), { delayMs: 250, ...o });
}
