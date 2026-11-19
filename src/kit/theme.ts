import { cancelRender, continueRender, delayRender, spring } from "remotion";
import { getAvailableFonts } from "@remotion/google-fonts";
import brand from "brand-theme";

/** The brand this render is for (brand/<slug>/brand.json). remotion.config.ts decides which one: REEL_BRAND, else the first brand. */
export const BRAND = brand;

/** Mixes two #rrggbb colours: `amount` 0 gives `a`, 1 gives `b`. */
export const mix = (a: string, b: string, amount: number): string => {
  const p = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const c = (i: number) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * amount).toString(16).padStart(2, "0");
  return `#${c(0)}${c(1)}${c(2)}`;
};

/**
 * The brand's colours. `red` and `purple` are older names for the accent and the secondary accent (kept so existing reels
 * compile); new code should use `accent` and `secondary`.
 */
export const C = {
  bg: brand.colors.background,
  ink: brand.colors.text,
  accent: brand.colors.accent,
  secondary: brand.colors.secondary,
  red: brand.colors.accent,
  purple: brand.colors.secondary,
  paper: "#ffffff",
  mute: mix(brand.colors.background, brand.colors.text, 0.16),
} as const;

type FontModule = { loadFont: (style?: "normal", o?: { weights?: string[]; subsets?: string[] }) => { fontFamily: string; waitUntilDone: () => Promise<void> } };

/** Loads a Google font by its family name. Throws a readable error for a name Remotion cannot load. */
async function loadByName(family: string, weights: string[]): Promise<void> {
  const info = getAvailableFonts().find((f) => f.fontFamily === family);
  if (!info) throw new Error(`The font "${family}" in brand.json is not a Google font that Remotion can load.`);
  const mod = (await info.load()) as FontModule;
  try { await mod.loadFont("normal", { weights, subsets: ["latin"] }).waitUntilDone(); } catch { await mod.loadFont("normal").waitUntilDone(); }
}

const handle = delayRender(`Loading the fonts of ${brand.name}`);
Promise.all([loadByName(brand.fonts.headline, ["700"]), loadByName(brand.fonts.body, ["600", "800"])])
  .then(() => continueRender(handle))
  .catch((e: unknown) => cancelRender(e));

/** Font families to put in `fontFamily`. `oswald` and `inter` are the older names, from the first brand this kit was made for. */
export const headline = brand.fonts.headline;
export const body = brand.fonts.body;
export const oswald = headline;
export const inter = body;

export const FPS = 30;
export const W = 1080;
export const H = 1920;
// Instagram-safe area: top 220, bottom 420, right 140
export const SAFE = { left: 70, right: 140, top: 220, bottom: 420 } as const;
export const CONTENT_W = W - SAFE.left - SAFE.right; // 870
export const CENTER_X = SAFE.left + CONTENT_W / 2; // 505

export const msToFrame = (ms: number) => Math.round((ms * FPS) / 1000);

/** 0 before `at`, springs to 1 after. Fast, lands with weight. */
export const pop = (frame: number, at: number) =>
  spring({ frame: frame - at, fps: FPS, config: { damping: 15, stiffness: 260, mass: 0.6 } });

/** Linear 0..1 progress between two frames, clamped. */
export const prog = (frame: number, from: number, to: number) =>
  Math.min(1, Math.max(0, (frame - from) / Math.max(1, to - from)));

export type Word = { word: string; startMs: number; endMs: number };
export type Sentence = { text: string; startMs: number; endMs: number; words: Word[] };
export type Props = { audio: string; totalMs: number; sentences: Sentence[] };
