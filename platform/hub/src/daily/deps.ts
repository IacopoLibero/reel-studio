import type { Config } from "../config.js";
import type { JobRunner } from "../jobs/runner.js";
import type { JobStore } from "../jobs/store.js";
import type { BrandCtx } from "../brands/context.js";
import type { Settings } from "../shared/types.js";
import type { NotificationStore } from "./notifications.js";

/** The daily loop of one brand. `config.dataDir` is that brand's data folder, so plans, locks and files stay in it. */
export interface DailyDeps {
  config: Config;
  brand: BrandCtx;
  store: JobStore;
  settings: { get: () => Settings };
  runner: JobRunner;
  notes: NotificationStore;
  now: () => Date;
}

/** An error that the route answers with a given status and an optional machine code. */
export class DailyError extends Error {
  constructor(message: string, readonly status = 409, readonly code?: string) { super(message); }
}
