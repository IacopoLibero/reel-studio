import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { DailyError, type DailyDeps } from "../src/daily/deps.js";
import { NotificationStore } from "../src/daily/notifications.js";
import { readPlan } from "../src/daily/plan.js";
import { confirmReel, discardReel, rejectReel, slotOptions } from "../src/daily/review.js";
import { approve, skip, startDaily, startRun } from "../src/daily/service.js";
import { dailyView } from "../src/daily/view.js";
import { JobRunner } from "../src/jobs/runner.js";
import { JobStore } from "../src/jobs/store.js";
import { DEFAULT_SETTINGS, SettingsStore } from "../src/settings.js";
import { testRegistry } from "./helpers/brand.js";

const FAKE = join(import.meta.dirname, "fixtures/fake-claude-daily.mjs");
const SCHED = join(import.meta.dirname, "fixtures/fake-scheduler.mjs");
const DATE = "2026-11-20";
const NOW = new Date("2026-11-20T09:00:00Z");
let tmp: string, root: string, data: string, bdata: string, blog: string, dd: DailyDeps, store: JobStore, stop: () => void;
const qfile = () => join(bdata, "reel-questions.md");
const schedLog = () => join(tmp, "sched.log");

beforeAll(() => { process.env.HUB_SCHEDULER_MODULE = SCHED; process.env.HUB_DAILY_FAKE_COLLECTOR = "1"; });
afterAll(() => { delete process.env.HUB_SCHEDULER_MODULE; delete process.env.HUB_DAILY_FAKE_COLLECTOR; });

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "daily-flow-"));
  root = join(tmp, "root"); data = join(tmp, "data"); blog = join(tmp, "er/app/blog/posts");
  mkdirSync(data); mkdirSync(root, { recursive: true }); mkdirSync(blog, { recursive: true });
  const { reg, ctx } = testRegistry(root, data, "acme", { offer: { lastDay: "2026-11-30", regex: "ACMEFREE" } });
  bdata = ctx.paths.dataDir;
  copyFileSync(join(import.meta.dirname, "fixtures/reel-questions.md"), qfile());
  for (const f of ["improve-restaurant-efficiency.ts", "index.ts"]) writeFileSync(join(blog, f), "");
  process.env.FAKE_SCHED_LOG = schedLog(); process.env.FAKE_SCHEDULED_FILE = join(bdata, "scheduled.json"); delete process.env.FAKE_SCHED_FAIL; delete process.env.FAKE_MODE;
  writeFileSync(ctx.paths.settingsFile, JSON.stringify({ ...DEFAULT_SETTINGS, daily: { enabled: true, earliest: "06:00", ideas: 3 }, factory: { ...DEFAULT_SETTINGS.factory, concurrency: 3 } }));
  const config: Config = { port: 0, host: "127.0.0.1", dataDir: data, root, token: "t", webDir: "", novncTarget: "", claudeBin: FAKE, blogDir: blog, terminalCmd: null };
  store = new JobStore(join(data, "jobs.json"));
  const settings = new SettingsStore(join(data, "settings.json"), { brandFile: (s) => reg.paths(s).settingsFile, defaultSlug: () => reg.defaultSlug() });
  const runner = new JobRunner(store, settings, { root, claudeBin: FAKE, dataDir: data, blogDir: blog, brands: reg });
  runner.start();
  dd = { config: { ...config, dataDir: bdata }, brand: ctx, store, settings: settings.forBrand("acme"), runner, notes: NotificationStore.at(bdata), now: () => NOW };
  stop = () => undefined;
});
afterEach(() => { stop(); store.flush(); rmSync(tmp, { recursive: true, force: true }); });

async function until<T>(fn: () => T | undefined | false, ms = 20000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timeout; plan is ${JSON.stringify(readPlan(bdata, DATE)?.status)} ${JSON.stringify(readPlan(bdata, DATE)?.error)}`);
    await new Promise((r) => setTimeout(r, 40));
  }
}
const status = () => dailyView(dd, DATE).plan?.status;
const waitStatus = (s: string) => until(() => status() === s || undefined);
const toApproval = async () => { startRun(dd, DATE); await waitStatus("awaiting_approval"); return readPlan(bdata, DATE)!; };
const create = async () => { const p = await toApproval(); await approve(dd, DATE, p.ideas.map((i) => ({ ideaId: i.id, closing: "A" as const }))); await waitStatus("awaiting_review"); return dailyView(dd, DATE); };

describe("the daily loop end to end (fake claude, fake collector, fake scheduler)", () => {
  it("is triggered by the loop, builds the plan and notifies, and creates nothing", async () => {
    const before = readFileSync(qfile(), "utf8");
    const loop = startDaily(dd, (async () => new Response(null)) as typeof fetch);
    stop = loop.stop;
    expect((await loop.tick() as { run: boolean }).run).toBe(true);
    await waitStatus("awaiting_approval");
    const p = readPlan(bdata, DATE)!;
    expect(p.ideas).toHaveLength(3);
    expect(p.ideas[0]).toMatchObject({ basedOnData: expect.stringContaining("Based on your data"), threads: "A short Threads text about napkins." });
    expect(p.readout?.bestTimes).toContain("Tue 17:30");
    expect(p.proposals[0]?.title).toBe("Shorter captions");
    expect(p.skillsMissing).toEqual([]);
    expect(p.collect).toMatchObject({ stub: true });
    expect(dd.notes.list(true)).toHaveLength(1);
    expect(dd.notes.list(true)[0]).toMatchObject({ kind: "daily", title: "Reel Hub, Acme: 3 new reel ideas", brand: "acme" });
    expect(dd.notes.list(true)[0]?.body.split("\n")).toHaveLength(3);
    expect(readFileSync(qfile(), "utf8")).toBe(before);
    expect(store.list().filter((j) => j.type === "reel.make")).toHaveLength(0);
    expect(existsSync(schedLog())).toBe(false);
    expect((await loop.tick() as { reason: string }).reason).toBe("already ran today");
    expect(store.list().filter((j) => j.type === "daily.run")).toHaveLength(1);
  });

  it("approve creates one reel.make per selected idea with the edited closing, and ticks nothing early", async () => {
    const p = await toApproval();
    const [a, b] = p.ideas as [typeof p.ideas[0], typeof p.ideas[0]];
    await approve(dd, DATE, [{ ideaId: a.id, closing: "B" }, { ideaId: b.id, closing: "A" }]);
    const makes = store.list().filter((j) => j.type === "reel.make");
    expect(makes).toHaveLength(2);
    expect(new Set(makes.map((j) => j.params.closing))).toEqual(new Set(["A", "B"]));
    expect(readFileSync(qfile(), "utf8")).toContain(a.question);
    await waitStatus("awaiting_review");
    const v = dailyView(dd, DATE);
    expect(v.reels).toHaveLength(2);
    expect(v.reels.every((r) => r.state === "review" && r.checks.every((c) => c.ok) && r.selfCheck.includes("Checks: loudness"))).toBe(true);
    expect(v.reels[0]?.mp4Url).toContain("/api/brands/acme/reels/file");
    await expect(approve(dd, DATE, [{ ideaId: a.id, closing: "A" }])).rejects.toThrow(/nothing can be created/);
  });

  it("reject reruns in the same folder with the note, at most twice", async () => {
    const v = await create();
    const r = v.reels[0]!;
    rejectReel(dd, DATE, r.ideaId, "make the voice slower");
    expect(status()).toBe("creating");
    await waitStatus("awaiting_review");
    const after = dailyView(dd, DATE).reels.find((x) => x.ideaId === r.ideaId)!;
    expect(after).toMatchObject({ reruns: 1, folder: r.folder, note: "make the voice slower" });
    expect(after.selfCheck).toContain("Redone after note: make the voice slower");
    rejectReel(dd, DATE, r.ideaId, "again"); await waitStatus("awaiting_review");
    expect(dailyView(dd, DATE).reels.find((x) => x.ideaId === r.ideaId)?.reruns).toBe(2);
    const jobsBefore = store.list().length;
    expect(() => rejectReel(dd, DATE, r.ideaId, "third")).toThrow(/redone 2 times/);
    expect(store.list().length).toBe(jobsBefore);
    expect(() => rejectReel(dd, DATE, r.ideaId, "x")).toThrow(/few words/);
  });

  it("confirm schedules only after the click, with the offer rule for late slots", async () => {
    const v = await create();
    const a = v.reels[0]!;
    expect(a.closing).toBe("A");
    expect(existsSync(schedLog())).toBe(false);
    const opts = slotOptions(dd, DATE, a.ideaId);
    expect(opts.recommended).not.toBeNull();
    expect(opts.bestTimeNote).toMatch(/best time/);
    expect(opts.slots.every((s) => s.offerExpired === s.date > "2026-11-30")).toBe(true);
    const late = { date: "2026-12-02", time: "17:30" };
    expect(opts.offerLines).toHaveLength(1);
    expect(() => confirmReel(dd, DATE, a.ideaId, { ...late, dropOffer: false })).toThrowError(expect.objectContaining({ code: "offer_expired" }) as DailyError);
    expect(store.list().filter((j) => j.type === "instagram.schedule")).toHaveLength(0);
    confirmReel(dd, DATE, a.ideaId, { ...late, dropOffer: true });
    await until(() => dailyView(dd, DATE).reels.find((r) => r.ideaId === a.ideaId)?.state === "scheduled" || undefined);
    const logged = readFileSync(schedLog(), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, string>);
    expect(logged[0]).toMatchObject({ date: "2026-12-02", time: "17:30", captionFile: "caption.instagram.md" });
    const dir = join(bdata, "reels", a.key!.split("/")[1]!);
    expect(readFileSync(join(dir, "caption.md"), "utf8")).toContain("ACMEFREE");
    expect(readFileSync(join(dir, "caption.instagram.md"), "utf8")).not.toMatch(/ACMEFREE|🎁/);
    expect(readPlan(bdata, DATE)?.reels.find((r) => r.ideaId === a.ideaId)?.offerDropped).toBe(true);
  });

  it("an early slot keeps the caption as it is, and finishing every reel ends the plan", async () => {
    const v = await create();
    const [x, y, z] = v.reels as [typeof v.reels[0], typeof v.reels[0], typeof v.reels[0]];
    confirmReel(dd, DATE, x.ideaId, { date: "2026-11-24", time: "17:30", dropOffer: false });
    await until(() => readFileSync(join(bdata, "scheduled.json"), "utf8").includes("2026-11-24") || undefined).catch(() => undefined);
    expect(JSON.parse(readFileSync(schedLog(), "utf8").trim().split("\n")[0]!)).not.toHaveProperty("captionFile");
    expect(() => confirmReel(dd, DATE, y.ideaId, { date: "2026-11-24", time: "17:30", dropOffer: false })).toThrow(/slot/);
    confirmReel(dd, DATE, y.ideaId, { date: "2026-11-25", time: "17:30", dropOffer: false });
    discardReel(dd, DATE, z.ideaId, "not good");
    await waitStatus("done");
    expect(dailyView(dd, DATE).reels.map((r) => r.state).sort()).toEqual(["dropped", "scheduled", "scheduled"]);
  });

  it("a failed schedule job returns the reel to review", async () => {
    process.env.FAKE_SCHED_FAIL = "1";
    const v = await create();
    confirmReel(dd, DATE, v.reels[0]!.ideaId, { date: "2026-11-24", time: "17:30", dropOffer: false });
    await until(() => dailyView(dd, DATE).reels[0]?.error?.includes("login_required") || undefined);
    expect(dailyView(dd, DATE).reels[0]).toMatchObject({ state: "review", scheduleJobId: null });
    expect(status()).toBe("awaiting_review");
  });

  it("skip today creates nothing and the plan stays skipped", async () => {
    await toApproval();
    expect(skip(dd, DATE).status).toBe("skipped");
    expect(store.list().filter((j) => j.type === "reel.make")).toHaveLength(0);
    expect(() => skip(dd, DATE)).toThrow(DailyError);
    await expect(approve(dd, DATE, [{ ideaId: "0".repeat(12), closing: "A" }])).rejects.toThrow(/nothing can be created/);
  });

  it("fails clearly when no required skill was called, and can be run again after", async () => {
    process.env.FAKE_MODE = "noskill";
    startRun(dd, DATE);
    await waitStatus("failed");
    expect(readPlan(bdata, DATE)?.error).toMatch(/reel-hooks or reel-research/);
    expect(dd.notes.list()).toHaveLength(0);
    delete process.env.FAKE_MODE;
    expect(() => startRun(dd, DATE)).not.toThrow();
    await waitStatus("awaiting_approval");
  });

  it("goes on with a warning when only the analysis fails", async () => {
    process.env.FAKE_MODE = "analysis-fails";
    await toApproval();
    const p = readPlan(bdata, DATE)!;
    expect(p.readout).toBeNull();
    expect(p.warnings.join(" ")).toMatch(/analysis failed/);
    expect(p.ideas).toHaveLength(3);
  });

  it("refuses a second plan for the same day", async () => {
    await toApproval();
    expect(() => startRun(dd, DATE)).toThrow(/already a plan/);
  });
});
