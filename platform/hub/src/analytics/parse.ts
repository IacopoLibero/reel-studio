import { AnalyticsError, CONNECTION_FIX, type FailureKind } from "./errors.js";
import { GRAPH_TO_METRIC, type Metrics } from "./schemas.js";

export interface RawMedia {
  id: string; caption: string; mediaType: string; productType: string; permalink: string; postedAt: string; likes: number | null; comments: number | null;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const failureText = (raw: unknown): string => {
  const r = obj(raw);
  return str(r.error) || str(obj(r.data).message) || "Composio returned an error without a message.";
};

/** Sorts a failed Composio response into the few cases the collector handles differently. */
export function classifyFailure(raw: unknown): { kind: FailureKind; message: string } {
  const message = failureText(raw);
  const status = obj(obj(raw).data).status_code;
  let kind: FailureKind = "other";
  if (status === 429 || /rate limit|too many (calls|requests)|usage limit|request limit/i.test(message)) kind = "rate_limit";
  else if (/does not support the \S+ metric|not compatible with this media|not supported for this media|metric.{0,40}not supported/i.test(message)) kind = "unsupported";
  else if (/not available yet|not yet available|too early|no insights|not enough data|insufficient/i.test(message)) kind = "too_early";
  else if (/connected account|no (active )?connection|expired|reconnect|unauthori[sz]ed|invalid.{0,20}token|oauth|not linked|not connected|authenticat/i.test(message)) kind = "connection";
  return { kind, message };
}

/** The metric an "unsupported" error complains about, when it names one. */
export function unsupportedMetric(message: string): string | null {
  return /does not support the (\S+) metric/i.exec(message)?.[1] ?? null;
}

function ensureOk(raw: unknown): Record<string, unknown> {
  const r = obj(raw);
  if (r.successful === true) return obj(r.data);
  const f = classifyFailure(raw);
  if (f.kind === "connection") throw new AnalyticsError(`${CONNECTION_FIX} (${f.message.slice(0, 200)})`, "connection");
  throw new AnalyticsError(`Instagram read failed: ${f.message.slice(0, 300)}`, f.kind);
}

/** One page of INSTAGRAM_GET_IG_USER_MEDIA. */
export function parseMediaPage(raw: unknown): { media: RawMedia[]; after: string | null } {
  const data = ensureOk(raw);
  const list = Array.isArray(data.data) ? data.data : [];
  const media = list.map((m): RawMedia => {
    const o = obj(m);
    return {
      id: str(o.id), caption: str(o.caption), mediaType: str(o.media_type) || "UNKNOWN", productType: str(o.media_product_type) || "UNKNOWN",
      permalink: str(o.permalink), postedAt: str(o.timestamp), likes: numOrNull(o.like_count), comments: numOrNull(o.comments_count),
    };
  }).filter((m) => m.id);
  const after = str(obj(obj(data.paging).cursors).after);
  return { media, after: after || null };
}

/** INSTAGRAM_GET_IG_MEDIA_INSIGHTS: only numeric lifetime values of known metrics. */
export function parseInsights(raw: unknown): Metrics {
  const data = ensureOk(raw);
  const out: Record<string, number> = {};
  for (const item of Array.isArray(data.data) ? data.data : []) {
    const o = obj(item);
    const key = GRAPH_TO_METRIC[str(o.name)];
    const first = Array.isArray(o.values) ? obj(o.values[0]).value : undefined;
    if (key && typeof first === "number" && Number.isFinite(first)) out[key] = first;
  }
  return out as Metrics;
}
