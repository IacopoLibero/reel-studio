import type { MediaRecord } from "../src/analytics/schemas";
import type { DailySlotOptions, DailyViewData, NotificationData } from "../src/shared/daily";
import type { CharacterFields } from "../src/shared/character-prompt";
import type { BrandSummary, IdeaBatchView, SkillsData, CalendarData, FactoryQuestion, Job, MoveInfo, Reel, ScheduleEntry, Settings, Slot } from "../src/shared/types";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method, credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

async function callRaw<T>(method: "POST" | "PUT", path: string, body: Blob): Promise<T> {
  const res = await fetch(path, { method, credentials: "same-origin", headers: { "Content-Type": "application/octet-stream" }, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Upload failed (${res.status})`, res.status);
  return data as T;
}

let currentBrand = "";
/** The brand every brand-scoped call is for (set by the shell from the URL). */
export const setBrand = (slug: string): void => { currentBrand = slug; };
export const getBrand = (): string => currentBrand;
/** /api/brands/<current brand><path>: every page of a brand reads and writes through this prefix. */
export const scoped = (path: string): string => `/api/brands/${encodeURIComponent(currentBrand)}${path}`;

export interface CreatorOptions {
  assistant: { kind: "claude" | "codex" | "custom"; command: string; tested: boolean };
  slugs: string[];
  voices: { slug: string; name: string }[];
  characters: string[];
}
export interface BrandStyle {
  colors: { background: string; text: string; accent: string; secondary: string };
  fonts: { headline: string; body: string };
  closing: { A: { label: string; line: string }; B: { label: string; line: string } };
}
export interface FontList { names: string[]; checked: boolean }
export interface Uploaded { id: string; size: number; ext: string }
export interface ImportPreview {
  importId: string;
  preview: { brand: Record<string, unknown> & { slug: string; name: string }; styleMd: boolean; questions: boolean; logo: "png" | "svg" | null; voice: boolean; warnings: string[] };
}
export interface InterviewMessage { role: "user" | "assistant"; text: string }
export interface InterviewSummary { [key: string]: unknown }
export interface InterviewTurn { say: string; summary: InterviewSummary; done: boolean; draft: { brand: Record<string, unknown>; styleMd: string; errors: string[]; closingRules: { product: string[]; general: string[] } } | null }
export interface CreateRequest {
  source: "form" | "interview" | "import";
  brand: Record<string, unknown>;
  styleMd?: string;
  logoUpload?: string;
  importId?: string;
  voice?: { mode: "later" } | { mode: "reuse"; from: string } | { mode: "upload"; wavUpload: string; text: string };
  character?: { mode: "none" | "create" | "import"; name?: string; id?: string; fields?: CharacterFields; sheetUpload?: string };
  closingRules?: { product: string[]; general: string[] };
  dailyLoop?: boolean;
}
export interface VoiceCandidate { id: string; label: string; instruct: string; text: string; seconds: number }
export interface VoiceRequest { brand: { name: string; language: string; about: string; audience: string; tone: string }; character?: { name: string; description: string }; avoid?: string[] }
export interface StudioView {
  state: { status: "draft" | "preview" | "approved"; name: string; fields: CharacterFields; notes: string[]; builds: number; updatedAt: string };
  sheet: string | null;
  previews: string[];
  plan: { summary?: string; parts?: unknown[]; limits?: string } | null;
}

export interface BrandList { brands: BrandSummary[]; default: string | null }

export interface InstagramInfo {
  account?: string;
  brand?: { slug: string; name: string };
  status: { loggedIn?: boolean; state?: string; message?: string; checkedAt?: string; error?: string };
  stub: boolean;
  queue: Job[];
  scheduled: Record<string, ScheduleEntry>;
}

export interface AnalyticsData {
  collectedAt: string | null; dates: string[]; warnings: string[]; reels: MediaRecord[];
  readout: { date: string; markdown: string } | null;
}
export interface SeriesItem { id: string; name: string; promise: string; cadence: string; exampleHooks: string[]; questionIds: string[]; createdAt: string }
export interface SeriesQuestion { id: string; question: string; done: boolean; folder: string | null }
export interface SeriesData { series: SeriesItem[]; questions: SeriesQuestion[]; badges: Record<string, { id: string; name: string }> }
export type SeriesDraft = Omit<SeriesItem, "id" | "createdAt">;
export interface TimeSuggestions {
  at: string | null; enough: boolean; message: string; reelsUsed: number; basedOn: string; note: string;
  suggestions: { day: string; time: string; why: string }[]; defaults: { day: string; times: string[] }[];
}

export const api = {
  analytics: () => call<AnalyticsData>("GET", scoped("/analytics")),
  series: () => call<SeriesData>("GET", scoped("/series")),
  seriesBadges: () => call<Record<string, { id: string; name: string }>>("GET", scoped("/series/badges")),
  createSeries: (b: SeriesDraft) => call<SeriesItem>("POST", scoped("/series"), b),
  updateSeries: (id: string, b: SeriesDraft) => call<SeriesItem>("PUT", scoped(`/series/${id}`), b),
  assignSeries: (id: string, questionIds: string[]) => call<SeriesItem>("POST", scoped(`/series/${id}/assign`), { questionIds }),
  deleteSeries: (id: string) => call<{ ok: boolean }>("DELETE", scoped(`/series/${id}`)),
  suggestions: () => call<TimeSuggestions>("GET", scoped("/calendar/suggestions")),
  me: () => call<{ ok: boolean }>("GET", "/api/me"),
  login: (token: string) => call<{ ok: boolean }>("POST", "/api/login", { token }),
  logout: () => call<{ ok: boolean }>("POST", "/api/logout"),
  brands: () => call<BrandList>("GET", "/api/brands"),
  setLogo: (blob: Blob) => callRaw<{ ok: boolean }>("PUT", scoped("/logo"), blob),
  removeLogo: () => call<{ ok: boolean }>("DELETE", scoped("/logo")),
  logoUrl: (version: number) => `${scoped("/logo")}?v=${version}`,
  brandStyle: () => call<BrandStyle>("GET", scoped("/style")),
  saveBrandStyle: (s: BrandStyle) => call<BrandStyle>("PUT", scoped("/style"), s),
  jobs: () => call<Job[]>("GET", scoped("/jobs")),
  createJob: (type: string, params: Record<string, unknown>) => call<Job>("POST", scoped("/jobs"), { type, params }),
  job: (id: string) => call<Job>("GET", `/api/jobs/${id}`),
  cancelJob: (id: string) => call<Job>("POST", `/api/jobs/${id}/cancel`),
  reels: () => call<Reel[]>("GET", scoped("/reels")),
  slots: (count = 14) => call<Slot[]>("GET", scoped(`/slots?count=${count}`)),
  instagram: (fresh = false) => call<InstagramInfo>("GET", scoped(`/instagram${fresh ? "?fresh=1" : ""}`)),
  loginWindow: () => call<Record<string, unknown>>("POST", scoped("/instagram/login-window")),
  questions: () => call<FactoryQuestion[]>("GET", scoped("/factory/questions")),
  skills: () => call<SkillsData>("GET", "/api/skills"),
  changeSkills: (b: { enable?: string[]; disable?: string[]; confirmOutward?: boolean }) => call<SkillsData>("POST", "/api/skills", b),
  resetSkills: () => call<SkillsData>("POST", "/api/skills/reset"),
  ideas: () => call<IdeaBatchView[]>("GET", scoped("/factory/ideas")),
  resolveIdeas: (batch: string, accept: string[], reject: string[]) => call<{ added: string[]; skipped: { question: string; reason: string }[]; rejected: number }>("POST", scoped("/factory/ideas/resolve"), { batch, accept, reject }),
  calendar: (weeks = 12, fresh = false) => call<CalendarData>("GET", scoped(`/calendar?weeks=${weeks}${fresh ? "&fresh=1" : ""}`)),
  reschedule: (id: string, newAt: string) => call<Job>("POST", scoped("/calendar/reschedule"), { id, newAt }),
  deletePost: (id: string) => call<Job>("POST", scoped("/calendar/delete"), { id, confirm: true }),
  daily: (date?: string) => call<DailyViewData>("GET", scoped(`/daily${date ? `?date=${date}` : ""}`)),
  dailyRun: () => call<DailyViewData>("POST", scoped("/daily/run")),
  dailyApprove: (date: string, picks: { ideaId: string; closing: "A" | "B" }[]) => call<DailyViewData>("POST", scoped("/daily/approve"), { date, picks }),
  dailySkip: (date: string) => call<DailyViewData>("POST", scoped("/daily/skip"), { date }),
  dailySlots: (date: string, idea: string) => call<DailySlotOptions>("GET", scoped(`/daily/slots?date=${date}&idea=${idea}`)),
  dailyConfirm: (date: string, idea: string, slotDate: string, slotTime: string, dropOffer: boolean) => call<DailyViewData>("POST", scoped("/daily/confirm"), { date, idea, slotDate, slotTime, dropOffer }),
  dailyReject: (date: string, idea: string, note: string, discard = false) => call<DailyViewData>("POST", scoped("/daily/reject"), { date, idea, note, discard }),
  notifications: (unseen = true) => call<NotificationData[]>("GET", `/api/notifications${unseen ? "?unseen=1" : ""}`),
  creatorOptions: () => call<CreatorOptions>("GET", "/api/brand-creator/options"),
  fonts: () => call<FontList>("GET", "/api/brand-creator/fonts"),
  validateBrand: (brand: Record<string, unknown>) => call<{ ok: boolean; errors: string[] }>("POST", "/api/brand-creator/validate", { brand }),
  upload: (kind: "logo" | "voice" | "sheet", blob: Blob) => callRaw<Uploaded>("POST", `/api/brand-creator/uploads/${kind}`, blob),
  importZip: (blob: Blob) => callRaw<ImportPreview>("POST", "/api/brand-creator/import/zip", blob),
  importFolder: (files: { path: string; data: string }[]) => call<ImportPreview>("POST", "/api/brand-creator/import/folder", { files }),
  interview: (messages: InterviewMessage[]) => call<InterviewTurn>("POST", "/api/brand-creator/interview", { messages }),
  proposeVoices: (r: VoiceRequest) => call<{ job: Job }>("POST", "/api/brand-creator/voices", r),
  createBrand: (r: CreateRequest) => call<{ job: Job; slug: string }>("POST", "/api/brands", r),
  deleteBrand: (slug: string, confirm: string) => call<{ trash: string; moved: string[]; kept: string[] }>("POST", `/api/brands/${encodeURIComponent(slug)}/delete`, { confirm }),
  studio: () => call<StudioView>("GET", scoped("/character/studio")),
  saveStudioFields: (name: string, fields: CharacterFields) => call<StudioView>("PUT", scoped("/character/studio/fields"), { name, fields }),
  uploadSheet: (blob: Blob) => callRaw<StudioView>("PUT", scoped("/character/studio/sheet"), blob),
  approveCharacter: () => call<StudioView>("POST", scoped("/character/studio/approve")),
  moves: () => call<MoveInfo[]>("GET", scoped("/character")),
  settings: () => call<Settings>("GET", scoped("/settings")),
  saveSettings: (s: Settings) => call<Settings>("PUT", scoped("/settings"), s),
};
