import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { brandPaths, voiceRelPaths, voiceTarget } from "./paths.js";
import { readBrand, writeBrand } from "./registry.js";

/**
 * A brand that got a character after it was made (brand.json edited by hand: character.enabled) still has its voice
 * sample in identity/voice.*. Moves voice.wav, voice.txt and voice.json to mascot/<id>-voice.* and points brand.json at them.
 * Never overwrites: if a target file exists, nothing is moved and the brand is left as it is. Returns the files moved.
 */
export function moveVoiceToCharacter(dataDir: string, slug: string): string[] {
  const brand = readBrand(dataDir, slug);
  if (!brand || !brand.character.enabled) return [];
  const p = brandPaths(slug, { dataDir });
  const from = voiceTarget(p, { enabled: false, id: brand.character.id });
  const to = voiceTarget(p, brand.character);
  const pairs = ([[from.wav, to.wav], [from.txt, to.txt], [from.settings, to.settings]] as const).filter(([src]) => existsSync(src));
  if (!pairs.length || pairs.some(([, dst]) => existsSync(dst))) return [];
  mkdirSync(dirname(to.wav), { recursive: true });
  for (const [src, dst] of pairs) renameSync(src, dst);
  const rel = voiceRelPaths(brand.character);
  const pointsAtOld = brand.voice.sample === from.relWav || brand.voice.sampleText === from.relTxt;
  if (pointsAtOld) writeBrand(dataDir, { ...brand, voice: { ...brand.voice, sample: rel.sample, sampleText: rel.sampleText } });
  return pairs.map(([, dst]) => dst);
}

/** Runs moveVoiceToCharacter for every brand; one that fails is skipped, the others are still done. */
export function moveVoicesToCharacters(dataDir: string, slugs: string[], onError: (slug: string, e: unknown) => void = () => undefined): void {
  for (const slug of slugs) { try { moveVoiceToCharacter(dataDir, slug); } catch (e) { onError(slug, e); } }
}
