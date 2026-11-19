import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canRerun, canTransition, deriveStatus, listPlanDates, markDropped, markRerun, markScheduling, newPlan, PlanError, readPlan, reconcile, transition, updatePlan, writePlan } from "../src/daily/plan.js";
import { PLAN_STATUSES, type DailyPlan, type PlanReel } from "../src/daily/types.js";
import type { Job } from "../src/shared/types.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "daily-plan-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const reel = (o: Partial<PlanReel> = {}): PlanReel => ({ ideaId: "a1", question: "Q?", closing: "A", jobId: "j1", folder: null, key: null, state: "making", reruns: 0, note: "", error: null, scheduleJobId: null, slot: null, offerDropped: false, ...o });
const plan = (status: DailyPlan["status"], reels: PlanReel[] = []): DailyPlan => ({ ...newPlan("2026-11-20", new Date("2026-11-20T05:00:00Z")), status, reels, jobId: "run" });
const job = (id: string, status: Job["status"], o: Partial<Job> = {}): Job => ({ id, type: "reel.make", title: "", status, progress: 0, step: "", steps: [], stepIndex: 0, log: [], params: {}, createdAt: "", startedAt: null, finishedAt: null, result: {}, error: null, ...o });

describe("state machine", () => {
  it("walks the happy path", () => {
    let p = newPlan("2026-11-20");
    for (const to of ["analysing", "ideas", "awaiting_approval", "creating", "awaiting_review", "scheduling", "done"] as const) p = transition(p, to);
    expect(p.status).toBe("done");
  });
  it("refuses jumps and moves out of final states", () => {
    expect(() => transition(newPlan("2026-11-20"), "creating")).toThrow(PlanError);
    expect(() => transition(plan("awaiting_approval"), "awaiting_review")).toThrow(/cannot become/);
    for (const s of ["done", "skipped"] as const) for (const to of PLAN_STATUSES) expect(canTransition(s, to)).toBe(false);
  });
  it("nothing is created without the approval step", () => {
    expect(canTransition("ideas", "creating")).toBe(false);
    expect(canTransition("awaiting_approval", "scheduling")).toBe(false);
    expect(canTransition("awaiting_approval", "creating")).toBe(true);
    expect(canTransition("awaiting_approval", "skipped")).toBe(true);
  });
  it("failed can only restart from collecting", () => {
    expect(PLAN_STATUSES.filter((s) => canTransition("failed", s))).toEqual(["collecting"]);
  });
  it("does not mutate and keeps the error only on failed", () => {
    const p = newPlan("2026-11-20");
    const f = transition(p, "failed", { error: "boom" });
    expect(p.status).toBe("collecting");
    expect(f.error).toBe("boom");
    expect(transition(f, "collecting").error).toBeNull();
  });
});

describe("reconcile", () => {
  it("moves a finished make to review and fills folder and key", () => {
    const p = plan("creating", [reel()]);
    const r = reconcile(p, [job("j1", "done", { result: { folder: "22-x", key: "b/22-x" } })]);
    expect(r.status).toBe("awaiting_review");
    expect(r.reels[0]).toMatchObject({ state: "review", folder: "22-x", key: "b/22-x" });
  });
  it("keeps creating while a job runs and fails the reel when a job fails", () => {
    const p = plan("creating", [reel(), reel({ ideaId: "a2", jobId: "j2" })]);
    const r = reconcile(p, [job("j1", "running"), job("j2", "failed", { error: "no mp4" })]);
    expect(r.status).toBe("creating");
    expect(r.reels[1]).toMatchObject({ state: "failed", error: "no mp4" });
  });
  it("returns the same object when nothing changed", () => {
    const p = plan("creating", [reel()]);
    expect(reconcile(p, [job("j1", "running")])).toBe(p);
  });
  it("ends done when every reel failed", () => {
    expect(reconcile(plan("creating", [reel()]), [job("j1", "failed")]).status).toBe("done");
  });
  it("a scheduled reel finishes the plan; a failed schedule goes back to review", () => {
    const s = plan("scheduling", [reel({ state: "scheduling", scheduleJobId: "s1" })]);
    expect(reconcile(s, [job("s1", "done", { type: "instagram.schedule" })]).status).toBe("done");
    const back = reconcile(s, [job("s1", "failed", { error: "login_required" })]);
    expect(back.status).toBe("awaiting_review");
    expect(back.reels[0]).toMatchObject({ state: "review", error: "login_required", scheduleJobId: null });
  });
  it("a dead daily.run job fails the early plan; approval waiting plans are untouched", () => {
    expect(reconcile(plan("analysing"), [job("run", "failed", { error: "interrupted" })])).toMatchObject({ status: "failed", error: "interrupted" });
    const w = plan("awaiting_approval");
    expect(reconcile(w, [job("run", "done")])).toBe(w);
  });
  it("derives the status from the reels", () => {
    expect(deriveStatus([reel({ state: "making" }), reel({ state: "review" })])).toBe("creating");
    expect(deriveStatus([reel({ state: "review" }), reel({ state: "scheduling" })])).toBe("awaiting_review");
    expect(deriveStatus([reel({ state: "scheduling" })])).toBe("scheduling");
    expect(deriveStatus([reel({ state: "scheduled" }), reel({ state: "dropped" })])).toBe("done");
  });
});

describe("review moves", () => {
  const inReview = plan("awaiting_review", [reel({ state: "review", folder: "3-x", key: "b/3-x" })]);
  it("allows two reruns, then none", () => {
    const a = markRerun(inReview, "a1", "j2", "too slow");
    expect(a).toMatchObject({ status: "creating" });
    expect(a.reels[0]).toMatchObject({ state: "making", reruns: 1, note: "too slow", jobId: "j2" });
    const b = markRerun({ ...a, status: "awaiting_review", reels: [{ ...(a.reels[0] as PlanReel), state: "review" }] }, "a1", "j3", "still slow");
    expect(b.reels[0]?.reruns).toBe(2);
    expect(canRerun({ ...(b.reels[0] as PlanReel), state: "review" })).toBe(false);
    expect(() => markRerun({ ...b, status: "awaiting_review", reels: [{ ...(b.reels[0] as PlanReel), state: "review" }] }, "a1", "j4", "x")).toThrow(/rerun/);
  });
  it("scheduling and dropping set the state and the plan status", () => {
    const s = markScheduling(inReview, "a1", "s1", "2026-11-24 17:30", false);
    expect(s.status).toBe("scheduling");
    expect(s.reels[0]).toMatchObject({ state: "scheduling", scheduleJobId: "s1", slot: "2026-11-24 17:30" });
    expect(markDropped(inReview, "a1", "no").status).toBe("done");
  });
});

describe("persistence", () => {
  it("round trips, lists newest first and ignores junk", () => {
    writePlan(dir, plan("awaiting_approval"));
    writePlan(dir, { ...plan("done"), date: "2026-11-19" });
    writeFileSync(join(dir, "daily", "notes.txt"), "x");
    expect(readPlan(dir, "2026-11-20")?.status).toBe("awaiting_approval");
    expect(listPlanDates(dir)).toEqual(["2026-11-20", "2026-11-19"]);
  });
  it("returns null for missing, corrupt or badly dated plans", () => {
    expect(readPlan(dir, "2026-01-01")).toBeNull();
    mkdirSync(join(dir, "daily"), { recursive: true });
    writeFileSync(join(dir, "daily", "2026-01-02.json"), "{not json");
    expect(readPlan(dir, "2026-01-02")).toBeNull();
    expect(readPlan(dir, "../etc/passwd")).toBeNull();
  });
  it("updatePlan writes only when the plan changed and throws for a missing day", () => {
    writePlan(dir, plan("awaiting_approval"));
    expect(updatePlan(dir, "2026-11-20", (p) => ({ ...p, step: "x" })).step).toBe("x");
    expect(readPlan(dir, "2026-11-20")?.step).toBe("x");
    expect(() => updatePlan(dir, "2030-01-01", (p) => p)).toThrow(PlanError);
  });
});
