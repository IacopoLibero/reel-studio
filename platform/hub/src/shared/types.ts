export type JobType = "daily.run" | "reel.make" | "reel.edit" | "reel.ideas" | "instagram.reschedule" | "instagram.delete" | "instagram.schedule" | "blender.render" | "claude.task" | "voice.generate" | "analytics.collect" | "reel.insights" | "series.plan" | "schedule.suggest" | "brand.create" | "character.build" | "character.moves" | "carousel.make" | "carousel.edit";
export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export interface Job {
  id: string;
  type: JobType;
  /** The brand the job belongs to (jobs of old releases are tagged by the migration). */
  brand?: string;
  title: string;
  status: JobStatus;
  progress: number;
  step: string;
  steps: string[];
  stepIndex: number;
  log: string[];
  params: Record<string, unknown>;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  result: Record<string, unknown>;
  error: string | null;
}

export interface JobPatch {
  progress?: number;
  step?: string;
  stepIndex?: number;
  log?: string | string[];
}

export interface SlotPattern {
  timezone: string;
  /** Index 0 = Sunday ... 6 = Saturday; each entry is a list of "HH:MM". */
  days: string[][];
}

export interface DailySettings {
  enabled: boolean;
  earliest: string;
  ideas: number;
  /** Generate a Threads text per idea. Paused by default: posting to Threads needs the user's own Meta app. */
  threads: boolean;
}

export interface FactorySettings {
  concurrency: number;
  closingRules: { product: string[]; general: string[] };
}

export type AssistantKind = "claude" | "codex";
/** Which tool talks to the person in the brand creator (the interview, the character chat, the voice proposals). */
export interface AssistantSettings { kind: AssistantKind }

export interface Settings {
  assistant: AssistantSettings;
  factory: FactorySettings;
  daily: DailySettings;
  blenderDevice: "cpu" | "gpu" | "auto";
  claudeModel: string;
  terminalPermission: "ask" | "edit" | "plan" | "full";
  accountName: string;
  slotPattern: SlotPattern;
}

export interface Slot {
  date: string;
  time: string;
  iso: string;
  label: string;
  taken: boolean;
}

export interface ScheduleEntry {
  at: string;
  status: string;
  jobId?: string;
}

export type ReelStateName = "incomplete" | "to-schedule" | "scheduling" | "scheduled" | "posted";
export interface Reel {
  /** What the banner says: posted once the scheduled time has passed. */
  state: ReelStateName;
  /** The series the reel is an episode of: such reels are shown in the Series page, not in the Reels list. */
  series?: { id: string; name: string } | null;
  key: string;
  brand: string;
  folder: string;
  n: number;
  name: string;
  mp4: string | null;
  hasCaption: boolean;
  captionStart: string;
  hasCover: boolean;
  schedule: ScheduleEntry | null;
  scheduling: boolean;
}

export interface FactoryQuestion {
  id: string;
  brand: string;
  question: string;
  hook: string | null;
  source: string | null;
  sourceKind: "blog" | "needs-source" | "other";
  done: boolean;
  folder: string | null;
  closing: "A" | "B" | null;
  section: string;
  autoClosing: "A" | "B";
  reel: { hasMp4: boolean; hasCaption: boolean; hasCover: boolean; schedule: ScheduleEntry | null } | null;
  making: boolean;
}

export interface SkillView {
  name: string;
  risk: "safe" | "outward" | "conflict";
  reason: string;
  defaultEnabled: boolean;
  enabled: boolean;
}
export interface OurSkill { name: string; description: string }
export interface SkillsData { ours: OurSkill[]; skills: SkillView[]; counts: Record<SkillView["risk"], { total: number; enabled: number }> }

export interface IdeaView { id: string; question: string; hook: string; source: string; why: string; sourceSupports: string; closing: "A" | "B"; duplicate: boolean }
export interface IdeaBatchView { id: string; createdAt: string; brand: string; requested: number; dropped: number; notes: string[]; skillsUsed: string[]; ideas: IdeaView[] }

export interface MoveInfo {
  name: string;
  frames: number;
  loopFrom: number | null;
  rendered: boolean;
  renderedFrames: number;
  /** The move is registered in the character's Blender script. */
  inScript: boolean;
  inMascot: boolean;
  kind: "move" | "face";
}

export interface CalendarReel { key: string; brand: string; folder: string; n: number; name: string; closing: "A" | "B" | null }

export interface CalendarPost {
  id: string;
  scheduledAt: string;
  date: string;
  time: string;
  captionStart: string;
  status: "scheduled" | "queued" | "running" | "local";
  reel: CalendarReel | null;
  coverUrl: string | null;
  jobId?: string;
  busy: string | null;
}

export interface CalendarSlot { date: string; time: string; iso: string; taken: boolean }

export interface CalendarData {
  checkedAt: string | null;
  stale: boolean;
  error: string | null;
  stub: boolean;
  from: string;
  to: string;
  today: string;
  timezone: string;
  posts: CalendarPost[];
  slots: CalendarSlot[];
  busyJob: { id: string; title: string; progress: number; step: string; type: string } | null;
}

/** What the web app knows about a brand (GET /api/brands). */
export interface BrandSummary {
  /** The brand's product folder (read-only), or null. */
  productDir: string | null;
  slug: string;
  name: string;
  language: string;
  website: string;
  accent: string;
  background: string;
  colors: { background: string; text: string; accent: string; secondary: string };
  instagramAccount: string;
  hasInstagramUserId: boolean;
  /** brand/<slug>/logo.png exists. */
  hasLogo: boolean;
  character: { enabled: boolean; id: string; name: string };
}
