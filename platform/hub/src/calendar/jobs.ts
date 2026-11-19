import type { JobSpec } from "../jobs/store.js";
import { minutesAhead, MIN_LEAD_MINUTES } from "../slots.js";
import type { Job, Settings } from "../shared/types.js";
import { toLocal } from "./merge.js";

export class CalendarJobError extends Error {}

export interface KnownPost { id: string; scheduledAt: string; captionStart: string; date: string; time: string; reelKey: string | null; reelN: number | null }
export type CalendarAction = { kind: "reschedule"; id: string; newAt: string } | { kind: "delete"; id: string };
interface Deps { settings: Settings; jobs: readonly Job[]; posts: readonly KnownPost[]; now: Date }

export const RESCHEDULE_STEPS = ["Open calendar", "Find the post", "Change the time", "Verify"];
export const DELETE_STEPS = ["Open calendar", "Find the post", "Delete it", "Verify"];
const active = (j: Job) => j.status === "queued" || j.status === "running";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function buildCalendarJobSpec(a: CalendarAction, d: Deps): JobSpec {
  const post = d.posts.find((p) => p.id === a.id);
  if (!post) throw new CalendarJobError("That post is not in the calendar. Refresh from Instagram first.");
  if (d.jobs.some((j) => active(j) && (j.type === "instagram.reschedule" || j.type === "instagram.delete") && j.params.id === a.id)) {
    throw new CalendarJobError("This post already has a change waiting.");
  }
  const label = post.reelN === null ? "post" : `reel ${post.reelN}`;
  const base = { id: post.id, captionStart: post.captionStart, scheduledAt: post.scheduledAt, reelKey: post.reelKey };
  if (a.kind === "delete") {
    return { type: "instagram.delete", title: `Delete ${label} · ${post.date} ${post.time}`, steps: DELETE_STEPS, params: base };
  }
  const tz = d.settings.slotPattern.timezone;
  const { date, time } = toLocal(a.newAt, tz);
  if (Date.parse(a.newAt) === Date.parse(post.scheduledAt)) throw new CalendarJobError("That is the same time the post already has.");
  if (minutesAhead(date, time, tz, d.now) < MIN_LEAD_MINUTES) throw new CalendarJobError(`Instagram needs the time to be at least ${MIN_LEAD_MINUTES} minutes ahead.`);
  const key = `${date} ${time}`;
  const clash = d.posts.some((p) => p.id !== post.id && `${p.date} ${p.time}` === key)
    || d.jobs.some((j) => active(j) && ((j.type === "instagram.schedule" && `${j.params.date} ${j.params.time}` === key) || (j.type === "instagram.reschedule" && `${j.params.date} ${j.params.time}` === key)));
  if (clash) throw new CalendarJobError("Another reel already uses that slot.");
  const day = DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
  return { type: "instagram.reschedule", title: `Move ${label} to ${day} ${date.slice(8)}/${date.slice(5, 7)} ${time}`, steps: RESCHEDULE_STEPS, params: { ...base, newAt: a.newAt, date, time } };
}
