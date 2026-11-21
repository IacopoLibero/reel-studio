import type { Brand } from "../brands/schema.js";
import { languageName } from "../brands/wording.js";
import { templateValues } from "../brands/template.js";

export interface StyleOptions {
  /** The brand has a logo (identity/logo.png). Only PNG: covers and reel closings draw public/logo.png. */
  logo: "png" | null;
  /** The voice sample is stored with the brand (see voiceTarget in brands/paths.ts) and style.md already names it. */
  voice: boolean;
  /** What the character is, when one is being created (goes into the Mascot section). */
  mascot?: string;
}

const NO_LOGO_TEXT = " No logo yet: the cover is drawn without a logo frame. When there is one, save it in the identity folder as logo.png.";
const NO_LOGO_RE = / No logo yet: the cover is drawn without a logo frame\.[^\n]*/;
const LOGO_RE = / Logo: `[^`\n]*logo\.png`\./;

/** Keeps the logo sentence of a brand's style.md true after a logo is set or removed. A style.md without that sentence is returned unchanged. */
export function withLogoLine(md: string, hasLogo: boolean): string {
  const logoText = " Logo: `identity/logo.png`.";
  return hasLogo ? md.replace(NO_LOGO_RE, () => logoText).replace(LOGO_RE, () => logoText) : md.replace(LOGO_RE, () => NO_LOGO_TEXT);
}

const section = (md: string, title: string): { from: number; to: number } | null => {
  const m = new RegExp(`^## ${title}\\s*$`, "m").exec(md);
  if (!m) return null;
  const next = md.indexOf("\n## ", m.index + 1);
  return { from: m.index, to: next < 0 ? md.length : next + 1 };
};

/**
 * Turns the filled brand/_template/style.md into this brand's guide: the paths of the logo and the voice match what the creator really stored,
 * the Mascot section goes when there is no character, and what the person said about the brand (about, audience, tone, language) is added.
 */
export function adaptStyle(filled: string, b: Brand, o: StyleOptions): string {
  let md = filled;
  if (!o.logo) md = md.replace(LOGO_RE, () => NO_LOGO_TEXT);
  if (!o.voice) md = md.replace(/^- Chosen voice:.*$/m, `- No voice sample yet. Record one (see \`.claude/skills/reel/voice-sample.md\`), save it as \`${templateValues(b).VOICE_BASE}.wav\` with its words in \`${templateValues(b).VOICE_BASE}.txt\`, and set "voice" in brand.json.`);
  const mascot = section(md, "Mascot");
  if (mascot && !o.mascot && !b.character.enabled) md = md.slice(0, mascot.from) + md.slice(mascot.to);
  else if (o.mascot) md = md.replace(/\{\{MASCOT_DESCRIPTION\}\} \(delete this section[^)]*\)/, o.mascot.trim()).replace(/\{\{MASCOT_DESCRIPTION\}\}/g, o.mascot.trim());
  const lines = [
    b.about && `- What it is: ${b.about}`,
    b.audience && `- Who the reels are for: ${b.audience}`,
    b.tone && `- Tone: ${b.tone}`,
    `- The reels are written and spoken in ${languageName(b.language)}.`,
  ].filter(Boolean);
  const intro = `\n## About the brand\n${lines.join("\n")}\n`;
  const first = md.indexOf("\n## ");
  return first < 0 ? `${md.trimEnd()}\n${intro}` : `${md.slice(0, first).trimEnd()}\n${intro}${md.slice(first)}`;
}

const SKELETON = "## Done\n\n## To do\n\n";

/** The question list of a new brand: the template's explanation, both sections, no questions. */
export function emptyQuestions(filled: string, name: string): string {
  const i = filled.search(/^## /m);
  const head = i < 0 ? `# Reel questions: ${name}\n\n` : filled.slice(0, i);
  return `${head}${SKELETON}`;
}
