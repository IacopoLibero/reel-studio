import { linkSkillsForCodex, toolOf } from "../ai/agent.js";
import type { Job } from "../shared/types.js";
import type { SettingsStore } from "../settings.js";
import { blogDirOf, brandCtx, type BrandCtx } from "../brands/context.js";
import type { BrandRegistry } from "../brands/registry.js";
import { HANDLERS } from "./handlers.js";
import type { JobStore } from "./store.js";
import type { CreatorServices } from "../creator/services.js";

/** Lanes run one job at a time each: Instagram on its own, character work (Claude and Blender) on another. Other types run alone. */
const laneOf = (j: Job): string => (j.type.startsWith("instagram.") ? "instagram" : j.type === "voice.generate" ? "voice" : j.type === "reel.make" ? "factory" : j.type === "reel.edit" ? "edit" : j.type === "reel.ideas" ? "ideas" : j.type === "daily.run" ? "daily" : ["analytics.collect", "reel.insights", "series.plan", "schedule.suggest"].includes(j.type) ? "analytics" : j.type === "brand.create" ? "brand" : "character");

export class JobRunner {
  private controllers = new Map<string, AbortController>();
  private busy = new Map<string, number>();

  private capacity(lane: string, job: Job): number {
    return lane === "factory" ? this.settings.get(this.slugOf(job) ?? undefined).factory.concurrency : 1;
  }

  /** The brand of a job: its tag, else the brand named in its params (old jobs), else the machine's first brand. */
  private slugOf(job: Job): string | null {
    const named = job.brand ?? (typeof job.params.brand === "string" ? job.params.brand : null);
    return named ?? this.opts.brands.defaultSlug();
  }

  private ctxOf(job: Job): BrandCtx | null {
    const slug = this.slugOf(job);
    return slug ? brandCtx(this.opts.brands, slug) : null;
  }

  constructor(
    private readonly store: JobStore,
    private readonly settings: SettingsStore,
    private readonly opts: { root: string; claudeBin: string; codexBin?: string; dataDir: string; blogDir: string; brands: BrandRegistry; creator?: () => CreatorServices },
  ) {}

  /** Starts queued jobs found in the store (after a restart) and any new ones. */
  start(): void {
    this.store.onChange((j) => { if (j.status === "queued") this.pump(); });
    this.pump();
  }

  enqueue(job: Job): void { if (job.status === "queued") this.pump(); }

  cancel(id: string): Job {
    const job = this.store.get(id);
    if (!job) throw new Error("Job not found");
    if (job.status === "queued") return this.store.setStatus(id, "cancelled");
    if (job.status === "running") {
      this.controllers.get(id)?.abort();
      return this.store.patch(id, { log: "Cancel requested" });
    }
    return job;
  }

  private pump(): void {
    const queued = [...this.store.list()].reverse().filter((j) => j.status === "queued");
    for (const job of queued) {
      const lane = laneOf(job);
      const used = this.busy.get(lane) ?? 0;
      if (used >= this.capacity(lane, job)) continue;
      this.busy.set(lane, used + 1);
      void this.run(job.id, lane);
    }
  }

  private async run(id: string, lane: string): Promise<void> {
    const ac = new AbortController();
    this.controllers.set(id, ac);
    const running = this.store.setStatus(id, "running");
    const handler = HANDLERS[running.type];
    try {
      if (!handler) throw new Error(`Jobs of type ${running.type} are not handled by the hub.`);
      const brand = this.ctxOf(running);
      // Codex looks for skills in .agents/skills: the ones of .claude/skills are linked there first.
      if (toolOf({ settings: this.settings.get(brand?.slug) }) === "codex") { try { linkSkillsForCodex(this.opts.root); } catch { /* a read-only folder: the run goes on without the links */ } }
      const result = await handler(running, {
        update: (p) => { try { this.store.patch(id, p); } catch { /* job removed */ } },
        signal: ac.signal, settings: this.settings.get(brand?.slug), brand, root: this.opts.root, claudeBin: this.opts.claudeBin, codexBin: this.opts.codexBin,
        dataDir: brand?.paths.dataDir ?? this.opts.dataDir, blogDir: brand ? blogDirOf(this.opts.root, brand.brand) : this.opts.blogDir,
        startedAtMs: Date.now() - 1000,
        ...(this.opts.creator ? { creator: this.opts.creator() } : {}),
      });
      this.store.setStatus(id, ac.signal.aborted ? "cancelled" : "done", { result });
    } catch (e) {
      const code = (e as { code?: unknown }).code;
      const msg = `${typeof code === "string" && /^[a-z_]+$/.test(code) ? `${code}: ` : ""}${(e as Error).message || "Unknown error"}`;
      if (ac.signal.aborted) this.store.setStatus(id, "cancelled");
      else this.store.setStatus(id, "failed", { error: friendly(msg) });
    } finally {
      this.controllers.delete(id);
      this.busy.set(lane, Math.max(0, (this.busy.get(lane) ?? 1) - 1));
      this.pump();
    }
  }
}

function friendly(msg: string): string {
  if (msg.startsWith("login_required")) return `${msg}. Log in first in Settings > Instagram.`;
  return msg;
}
