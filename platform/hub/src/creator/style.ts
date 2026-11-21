import type { Brand } from "../brands/schema.js";
import { languageName } from "../brands/wording.js";

export interface StyleOptions {
  logo: "png" | "svg" | null;
  /** The voice sample is stored at brand/<slug>/voice/voice.wav with its words in voice/voice.txt. */
  voice: boolean;
  /** What the character is, when one is being created (goes into the Mascot section). */
  mascot?: string;
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
  if (o.logo) md = md.split(`brand/${b.slug}/logo.png`).join(`brand/${b.slug}/logo.${o.logo}`);
  else md = md.replace(/ Logo: `brand\/[^`]*\/logo\.png`\./, " No logo yet: the cover is drawn without a logo frame. When there is one, save it in this folder as logo.png (or logo.svg).");
  if (o.voice) md = md.split(`brand/${b.slug}/voice.wav`).join(`brand/${b.slug}/voice/voice.wav`).replace("(its words are in `voice.txt` next to it", "(its words are in `voice/voice.txt`");
  else md = md.replace(/^- Chosen voice:.*$/m, `- No voice sample yet. Record one (see \`voice-sample.md\`), save it as \`brand/${b.slug}/voice/voice.wav\` with its words in \`voice/voice.txt\`, and set "voice" in brand.json.`);
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
