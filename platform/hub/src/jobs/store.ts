import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Job, JobPatch, JobStatus, JobType } from "../shared/types.js";

export interface JobSpec {
  type: JobType;
  /** Brand slug: the job runs with that brand's data, settings and Instagram profile. */
  brand?: string;
  title: string;
  steps?: string[];
  params?: Record<string, unknown>;
}

interface StoreOptions { maxLog?: number; maxJobs?: number }
type Listener = (job: Job) => void;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Jobs kept in memory and persisted to a JSON file. Jobs are never mutated: every change builds a new object. */
export class JobStore {
  private jobs = new Map<string, Job>();
  private listeners = new Set<Listener>();
  private timer: NodeJS.Timeout | null = null;
  private readonly maxLog: number;
  private readonly maxJobs: number;

  constructor(private readonly file: string, opts: StoreOptions = {}) {
    this.maxLog = opts.maxLog ?? 500;
    this.maxJobs = opts.maxJobs ?? 300;
    this.load();
  }

  private load(): void {
    if (!existsSync(this.file)) return;
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(this.file, "utf8")); } catch { return; }
    if (!Array.isArray(raw)) return;
    for (const item of raw as Job[]) {
      if (!item || typeof item.id !== "string") continue;
      const job = item.status === "running"
        ? { ...item, status: "failed" as const, error: "interrupted", finishedAt: new Date().toISOString() }
        : item;
      this.jobs.set(job.id, job);
    }
    this.flush();
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  list(): Job[] {
    return [...this.jobs.values()].reverse();
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  create(spec: JobSpec): Job {
    const steps = spec.steps ?? [];
    const job: Job = {
      id: randomUUID(), type: spec.type, ...(spec.brand ? { brand: spec.brand } : {}), title: spec.title, status: "queued", progress: 0,
      step: steps[0] ?? "", steps, stepIndex: 0, log: [], params: spec.params ?? {},
      createdAt: new Date().toISOString(), startedAt: null, finishedAt: null, result: {}, error: null,
    };
    return this.commit(job);
  }

  patch(id: string, p: JobPatch): Job {
    const cur = this.require(id);
    const lines = p.log === undefined ? [] : Array.isArray(p.log) ? p.log : [p.log];
    const log = lines.length ? [...cur.log, ...lines].slice(-this.maxLog) : cur.log;
    return this.commit({
      ...cur, log,
      progress: p.progress === undefined ? cur.progress : clamp01(p.progress),
      step: p.step ?? cur.step,
      stepIndex: p.stepIndex ?? cur.stepIndex,
    });
  }

  setStatus(id: string, status: JobStatus, extra: { result?: Record<string, unknown>; error?: string | null } = {}): Job {
    const cur = this.require(id);
    const now = new Date().toISOString();
    const finished = status === "done" || status === "failed" || status === "cancelled";
    return this.commit({
      ...cur, status,
      startedAt: status === "running" ? now : cur.startedAt,
      finishedAt: finished ? now : cur.finishedAt,
      progress: status === "done" ? 1 : cur.progress,
      result: extra.result ?? cur.result,
      error: extra.error ?? cur.error,
    });
  }

  private require(id: string): Job {
    const j = this.jobs.get(id);
    if (!j) throw new Error(`Job ${id} not found`);
    return j;
  }

  private commit(job: Job): Job {
    this.jobs.set(job.id, job);
    if (this.jobs.size > this.maxJobs) {
      const old = [...this.jobs.values()].find((j) => j.status !== "queued" && j.status !== "running");
      if (old) this.jobs.delete(old.id);
    }
    for (const l of this.listeners) l(job);
    this.schedule();
    return job;
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 300);
    this.timer.unref();
  }

  flush(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify([...this.jobs.values()], null, 1));
    renameSync(tmp, this.file);
  }
}
