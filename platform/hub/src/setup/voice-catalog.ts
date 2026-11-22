/** What the setup screen shows about VoiceStudio's voice models, read from VoiceStudio's own API. Only voices: Reel Studio does not use its transcription or language-model parts. */

export interface ModelRow { repoId: string; label: string; role: string; sizeGb: number; required: boolean; note: string; installed: boolean }
export interface PlanSummary {
  repoId: string; ready: boolean; blockers: string[]; planId: string; planDigest: string;
  components: { id: string; revision: string; license: string; url: string }[];
  documents: { id: string; title: string; url: string }[];
  /** The sentence the person must accept before VoiceStudio downloads the model. */
  acknowledgement: string;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** The voice (TTS) models of the catalog. */
export function summarizeCatalog(raw: unknown): ModelRow[] {
  return arr(obj(raw).models).map(obj).map((m) => ({
    repoId: str(m.repo_id), label: str(m.label), role: str(m.role), sizeGb: Number(m.size_gb) || 0,
    required: m.required === true, note: str(m.note), installed: m.installed === true,
  })).filter((m) => m.repoId && m.role === "TTS");
}

export function summarizePlan(raw: unknown): PlanSummary {
  const p = obj(raw);
  return {
    repoId: str(p.repo_id), ready: p.readiness === "ready", blockers: arr(p.blockers).map(str),
    planId: str(p.plan_id), planDigest: str(p.plan_digest),
    components: arr(p.components).map(obj).map((c) => ({ id: str(c.id), revision: str(c.revision), license: str(c.license), url: str(c.evidence_url) })),
    documents: arr(p.documents).map(obj).map((d) => ({ id: str(d.id), title: str(d.title) || str(d.id), url: str(d.url) })),
    acknowledgement: str(obj(p.acknowledgement).text),
  };
}

import { summarizeEngines, type EngineList } from "./voice-engines.js";

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** A small client of the VoiceStudio server. Nothing is installed here without the plan the person reviewed and their acknowledgement. */
export class VoiceClient {
  constructor(private readonly base: string, private readonly f: FetchLike = fetch as unknown as FetchLike) {}

  private async call(method: string, path: string, body?: unknown): Promise<unknown> {
    let res;
    try {
      res = await this.f(`${this.base}${path}`, { method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
    } catch { throw new Error("VoiceStudio is not running. Install it first (the voice step above) or wait a moment for it to start."); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(str(obj(data).detail) || str(obj(data).error) || `VoiceStudio answered ${res.status} for ${method} ${path}.`);
    return data;
  }

  catalog = async (): Promise<ModelRow[]> => summarizeCatalog(await this.call("GET", "/setup/recommendations"));
  installStatus = (): Promise<unknown> => this.call("GET", "/models/install/status");
  prepare = async (repoId: string): Promise<PlanSummary> => summarizePlan(await this.call("POST", "/models/install/prepare", { repo_id: repoId }));

  /** Downloads a model with VoiceStudio's own install call (the one its settings screen uses). The licence review (`prepare`) is shown to the person first. */
  engines = async (): Promise<EngineList> => summarizeEngines(await this.call("GET", "/engines/tts"));
  /** Makes an engine the voice VoiceStudio uses. */
  selectEngine = async (id: string): Promise<void> => { await this.call("POST", "/engines/select", { family: "tts", backend_id: id }); };
  /** Deletes a downloaded model from VoiceStudio's cache. */
  remove = async (repoId: string): Promise<void> => { await this.call("DELETE", `/models/${repoId.split("/").map(encodeURIComponent).join("/")}`); };
  cancel = async (repoId: string): Promise<void> => { await this.call("POST", "/models/install/cancel", { repo_id: repoId }); };
  install = (repoId: string): Promise<unknown> => this.call("POST", "/models/install", { repo_id: repoId });

}
