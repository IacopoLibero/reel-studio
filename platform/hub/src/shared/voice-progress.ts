/** Progress of VoiceStudio model downloads, as the setup screen shows it. Shared by the hub and the web page. */
export interface DownloadJob {
  repoId: string; state: string; percent: number | null;
  bytesDone: number; totalBytes: number; rate: number | null; etaSeconds: number | null; filesDone: number | null; filesTotal: number | null;
}

type Obj = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The downloads in the answer of VoiceStudio's /models/install/status. */
export function summarizeJobs(raw: unknown): DownloadJob[] {
  const jobs = raw && typeof raw === "object" ? (raw as Obj).jobs : null;
  if (!Array.isArray(jobs)) return [];
  return jobs.filter((j): j is Obj => !!j && typeof j === "object" && typeof (j as Obj).repo_id === "string").map((j) => {
    const done = num(j.bytes_done) ?? 0, total = num(j.total_bytes) ?? 0;
    return {
      repoId: String(j.repo_id), state: String(j.state ?? ""),
      percent: total > 0 ? Math.min(100, Math.floor((done / total) * 100)) : null,
      bytesDone: done, totalBytes: total, rate: num(j.rate), etaSeconds: num(j.eta_seconds), filesDone: num(j.files_done), filesTotal: num(j.files_total),
    };
  });
}

export function formatBytes(n: number): string {
  return n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`;
}

export function formatEta(seconds: number | null): string {
  if (seconds === null) return "";
  if (seconds < 60) return "less than a minute left";
  const min = Math.round(seconds / 60);
  return min < 60 ? `about ${min} min left` : `about ${Math.floor(min / 60)} h ${min % 60} min left`;
}
