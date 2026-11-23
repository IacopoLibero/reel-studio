import type { Settings } from "./shared/types.js";

/**
 * Environment for spawned jobs: no hub token, Blender device from the settings, and the brand the job works for
 * (REEL_BRAND picks the colours and fonts the Remotion kit reads from <data>/brands/<slug>/identity/brand.json).
 */
export function jobEnv(settings: Settings, brand: string | null = null, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const { HUB_TOKEN: _drop, ...rest } = base;
  const env: NodeJS.ProcessEnv = { ...rest, BLENDER_DEVICE: settings.blenderDevice, ...(brand ? { REEL_BRAND: brand } : {}) };
  // One tool for everything: Codex gets the Codex access and never an Anthropic key; Claude gets the Claude access.
  if (settings.assistant?.kind === "codex") { const { ANTHROPIC_API_KEY: _a, ANTHROPIC_AUTH_TOKEN: _b, ...clean } = env; return applyEnvLayer(clean, "codex"); }
  return applyEnvLayer(env, "claude");
}

type EnvLayer = (env: NodeJS.ProcessEnv) => NodeJS.ProcessEnv;
const layers: Partial<Record<"claude" | "codex", EnvLayer>> = {};
/** A last step applied to the environment of the runs of one tool (the hub puts the access in it: the login, or an API key). */
export const setEnvLayer = (provider: "claude" | "codex", fn: EnvLayer | null): void => { if (fn) layers[provider] = fn; else delete layers[provider]; };
export const applyEnvLayer = (env: NodeJS.ProcessEnv, provider: "claude" | "codex" = "claude"): NodeJS.ProcessEnv => { const l = layers[provider]; return l ? l(env) : env; };
