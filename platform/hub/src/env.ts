import type { Settings } from "./shared/types.js";

/**
 * Environment for spawned jobs: no hub token, Blender device from the settings, and the brand the job works for
 * (REEL_BRAND picks the colours and fonts the Remotion kit reads from <data>/brands/<slug>/identity/brand.json).
 */
export function jobEnv(settings: Settings, brand: string | null = null, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const { HUB_TOKEN: _drop, ...rest } = base;
  return { ...rest, BLENDER_DEVICE: settings.blenderDevice, ...(brand ? { REEL_BRAND: brand } : {}) };
}
