import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JobStore } from "../src/jobs/store.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "hub-store-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const spec = { type: "claude.task" as const, title: "T", steps: ["a", "b"], params: { x: 1 } };

describe("JobStore", () => {
  it("creates queued jobs and persists them", () => {
    const s = new JobStore(join(dir, "jobs.json"));
    const j = s.create(spec);
    expect(j.status).toBe("queued");
    expect(j.progress).toBe(0);
    s.flush();
    const saved = JSON.parse(readFileSync(join(dir, "jobs.json"), "utf8"));
    expect(saved).toHaveLength(1);
    expect(new JobStore(join(dir, "jobs.json")).get(j.id)?.title).toBe("T");
  });

  it("updates immutably and emits events", () => {
    const s = new JobStore(join(dir, "jobs.json"));
    const seen: string[] = [];
    s.onChange((j) => seen.push(j.status));
    const j = s.create(spec);
    const before = s.get(j.id)!;
    const after = s.patch(j.id, { progress: 0.5, step: "b", stepIndex: 1, log: ["l1", "l2"] });
    expect(before.progress).toBe(0);
    expect(after.progress).toBe(0.5);
    expect(after.log).toEqual(["l1", "l2"]);
    expect(s.patch(j.id, { log: "l3" }).log).toHaveLength(3);
    expect(seen.length).toBe(3);
  });

  it("clamps progress and caps the log", () => {
    const s = new JobStore(join(dir, "jobs.json"), { maxLog: 5 });
    const j = s.create(spec);
    expect(s.patch(j.id, { progress: 7 }).progress).toBe(1);
    expect(s.patch(j.id, { progress: -1 }).progress).toBe(0);
    const lines = Array.from({ length: 12 }, (_, i) => `l${i}`);
    expect(s.patch(j.id, { log: lines }).log).toEqual(["l7", "l8", "l9", "l10", "l11"]);
  });

  it("transitions status with timestamps", () => {
    const s = new JobStore(join(dir, "jobs.json"));
    const j = s.create(spec);
    const run = s.setStatus(j.id, "running");
    expect(run.startedAt).not.toBeNull();
    const done = s.setStatus(j.id, "done", { result: { ok: true } });
    expect(done.finishedAt).not.toBeNull();
    expect(done.progress).toBe(1);
    expect(done.result).toEqual({ ok: true });
    const f = s.setStatus(s.create(spec).id, "failed", { error: "boom" });
    expect(f.error).toBe("boom");
  });

  it("marks running jobs as interrupted on restart and keeps queued ones", () => {
    const file = join(dir, "jobs.json");
    const s = new JobStore(file);
    const a = s.create(spec);
    const b = s.create(spec);
    s.setStatus(a.id, "running");
    s.flush();
    const s2 = new JobStore(file);
    expect(s2.get(a.id)?.status).toBe("failed");
    expect(s2.get(a.id)?.error).toBe("interrupted");
    expect(s2.get(b.id)?.status).toBe("queued");
  });

  it("survives a corrupt file and throws on unknown id", () => {
    const file = join(dir, "jobs.json");
    writeFileSync(file, "{not json");
    const s = new JobStore(file);
    expect(s.list()).toEqual([]);
    expect(() => s.patch("nope", {})).toThrow(/not found/);
  });

  it("lists newest first", () => {
    const s = new JobStore(join(dir, "jobs.json"));
    const a = s.create(spec);
    const b = s.create(spec);
    expect(s.list().map((j) => j.id)).toEqual([b.id, a.id]);
  });
});
