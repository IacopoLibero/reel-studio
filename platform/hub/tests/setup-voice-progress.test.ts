import { describe, expect, it } from "vitest";
import { summarizeJobs, formatEta, formatBytes } from "../src/shared/voice-progress.js";

describe("summarizeJobs", () => {
  it("reads bytes, rate and eta of each running download", () => {
    const j = summarizeJobs({ jobs: [{ repo_id: "lj1995/GPT-SoVITS", state: "downloading", bytes_done: 188815730, total_bytes: 5295257798, rate: 3746458.7, eta_seconds: 1363, files_done: 0, files_total: 27 }] });
    expect(j).toEqual([{ repoId: "lj1995/GPT-SoVITS", state: "downloading", percent: 3, bytesDone: 188815730, totalBytes: 5295257798, rate: 3746458.7, etaSeconds: 1363, filesDone: 0, filesTotal: 27 }]);
  });
  it("has no percent while the total is unknown", () => {
    expect(summarizeJobs({ jobs: [{ repo_id: "a/b", state: "downloading", bytes_done: 5, total_bytes: 0 }] })[0]?.percent).toBeNull();
  });
  it("never goes over 100 percent", () => {
    expect(summarizeJobs({ jobs: [{ repo_id: "a/b", state: "downloading", bytes_done: 12, total_bytes: 10 }] })[0]?.percent).toBe(100);
  });
  it("tolerates a missing or odd answer", () => {
    expect(summarizeJobs(null)).toEqual([]);
    expect(summarizeJobs({ jobs: "x" })).toEqual([]);
    expect(summarizeJobs({ jobs: [{ state: "downloading" }] })).toEqual([]);
  });
});

describe("formatting", () => {
  it("formats sizes", () => {
    expect(formatBytes(0)).toBe("0 MB");
    expect(formatBytes(188_815_730)).toBe("189 MB");
    expect(formatBytes(5_295_257_798)).toBe("5.3 GB");
  });
  it("formats the time left", () => {
    expect(formatEta(null)).toBe("");
    expect(formatEta(45)).toBe("less than a minute left");
    expect(formatEta(1363)).toBe("about 23 min left");
    expect(formatEta(7300)).toBe("about 2 h 2 min left");
  });
});
