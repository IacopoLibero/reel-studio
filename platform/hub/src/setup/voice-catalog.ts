/** What the setup screen shows about VoiceStudio's models and language-model (LLM) choice, read from VoiceStudio's own API. */

export interface ModelRow { repoId: string; label: string; role: string; sizeGb: number; required: boolean; note: string; installed: boolean }
export interface ProviderRow { id: string; label: string; local: boolean; notes: string; needsKey: boolean; hasKey: boolean; signupUrl: string }
export interface ProviderList { active: string; providers: ProviderRow[] }
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

export function summarizeCatalog(raw: unknown): ModelRow[] {
  return arr(obj(raw).models).map(obj).map((m) => ({
    repoId: str(m.repo_id), label: str(m.label), role: str(m.role), sizeGb: Number(m.size_gb) || 0,
    required: m.required === true, note: str(m.note), installed: m.installed === true,
  })).filter((m) => m.repoId);
}

/** "off" first (VoiceStudio's own LLM is optional: Reel Studio makes reels with Claude Code), then every provider VoiceStudio knows. */
export function summarizeProviders(raw: unknown): ProviderList {
  const r = obj(raw);
  const providers = arr(r.providers).map(obj).filter((p) => str(p.id)).map((p): ProviderRow => ({
    id: str(p.id), label: str(p.display_name) || str(p.id), local: p.local === true, notes: str(p.notes),
    needsKey: p.local !== true && p.transport !== "cli", hasKey: p.has_api_key === true || p.key_from_env === true, signupUrl: str(p.signup_url),
  }));
  const active = str(r.active) || "off";
  return { active, providers: [{ id: "off", label: "No language model", local: true, notes: "Reel Studio writes with Claude Code. VoiceStudio's own LLM is only for translating and dubbing.", needsKey: false, hasKey: false, signupUrl: "" }, ...providers.filter((p) => p.id !== "off")] };
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
  providers = async (): Promise<ProviderList> => summarizeProviders(await this.call("GET", "/api/settings/llm-providers"));
  installStatus = (): Promise<unknown> => this.call("GET", "/models/install/status");
  prepare = async (repoId: string): Promise<PlanSummary> => summarizePlan(await this.call("POST", "/models/install/prepare", { repo_id: repoId }));

  /** Starts the download of the plan the person reviewed. `documentIds` are the notices they acknowledged. */
  commit = (a: { planId: string; planDigest: string; documentIds: string[] }): Promise<unknown> =>
    this.call("POST", "/models/install/commit", { plan_id: a.planId, plan_digest: a.planDigest, acknowledged_document_ids: a.documentIds, acknowledged: true, target: "local" });

  /** Chooses the LLM: a key is saved first when one is given, then the provider becomes the active one. "off" switches it off. */
  async setProvider(id: string, apiKey?: string): Promise<void> {
    if (apiKey) await this.call("PUT", `/api/settings/llm-providers/${encodeURIComponent(id)}`, { api_key: apiKey });
    await this.call("POST", "/api/settings/llm-providers/active", { provider: id });
  }
}
