// Stand-in for the Instagram scheduler module: records what it was asked and never opens a browser.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
export async function runScheduleJob(job, ctx) {
  if (process.env.FAKE_SCHED_LOG) appendFileSync(process.env.FAKE_SCHED_LOG, JSON.stringify(job.params) + "\n");
  ctx.update({ progress: 0.5, step: "Fake schedule" });
  if (process.env.FAKE_SCHED_FAIL === "1") throw new Error("login_required (fake)");
  if (process.env.FAKE_SCHEDULED_FILE) {
    const f = process.env.FAKE_SCHEDULED_FILE;
    const cur = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
    writeFileSync(f, JSON.stringify({ ...cur, [String(job.params.reel)]: { slot: String(job.params.slot), status: "scheduled" } }));
  }
  return { reel: String(job.params.reel), slot: String(job.params.slot), verified: true };
}
export async function getSessionStatus() { return { loggedIn: true, state: "fake" }; }
export async function openLoginWindow() { return { opened: false }; }
