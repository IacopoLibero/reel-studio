// Shapes of GET /api/daily, shared by the hub (src/daily/view.ts) and the Daily page. Types only.
export type PlanStatus = "collecting" | "analysing" | "ideas" | "awaiting_approval" | "creating" | "awaiting_review" | "scheduling" | "done" | "skipped" | "failed";
export type ReelState = "making" | "review" | "scheduling" | "scheduled" | "failed" | "dropped";

export interface DailyIdeaData { id: string; question: string; hook: string; source: string; why: string; sourceSupports: string; basedOnData: string; threads: string | null; closing: "A" | "B" }
export interface DailyReadout { text: string; repeat: string[]; stop: string[]; hookPatterns: string[]; bestTimes: string[] }
export interface DailyProposal { id: string; title: string; target: string; change: string; why: string }
export interface DailyPlanData {
  date: string; status: PlanStatus; createdAt: string; updatedAt: string; jobId: string | null; step: string; progress: number; error: string | null; warnings: string[];
  collect: { ok: boolean; stub: boolean; note: string } | null; readout: DailyReadout | null; proposals: DailyProposal[]; ideas: DailyIdeaData[];
  skillsUsed: string[]; skillsMissing: string[];
}
export interface JobBriefData { id: string; status: "queued" | "running" | "done" | "failed" | "cancelled"; progress: number; step: string; stepIndex: number; steps: string[]; error: string | null; log: string[] }
export interface DailyReelData {
  ideaId: string; question: string; closing: "A" | "B"; jobId: string | null; folder: string | null; key: string | null; state: ReelState; reruns: number; note: string; error: string | null;
  scheduleJobId: string | null; slot: string | null; offerDropped: boolean;
  job: JobBriefData | null; scheduleJob: JobBriefData | null; caption: string; checks: { label: string; ok: boolean }[]; selfCheck: string;
  mp4Url: string | null; coverUrl: string | null; rerunsLeft: number;
}
export interface DailyViewData {
  today: string; date: string; dates: string[]; plan: DailyPlanData | null; job: JobBriefData | null; reels: DailyReelData[];
  settings: { enabled: boolean; earliest: string; ideas: number; threads: boolean };
}
export interface DailySlotOptions {
  slots: Array<{ date: string; time: string; iso: string; label: string; taken: boolean; offerExpired: boolean }>;
  recommended: { date: string; time: string; label: string } | null; bestTimeNote: string | null; closing: "A" | "B"; offerLines: string[];
}
export interface NotificationData { id: string; kind: "daily" | "test"; title: string; body: string; url: string; createdAt: string; seen: boolean }
