import type { BrandRegistry } from "../brands/registry.js";
import type { SettingsStore } from "../settings.js";
import type { UploadStore } from "./uploads.js";

/** What the creation job needs from the hub: the registry, the staged uploads, the settings and the daily-loop starter. */
export interface CreatorServices {
  root: string;
  dataDir: string;
  brands: BrandRegistry;
  uploads: UploadStore;
  settings: SettingsStore;
  /** Starts the daily loop of a brand (startDailyLoops(...).ensure). */
  ensureDaily: (slug: string) => boolean;
}
