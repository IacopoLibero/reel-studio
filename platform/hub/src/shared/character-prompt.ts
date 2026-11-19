/** The prompt for an AI image tool that draws a brand character's reference sheet. Pure text: the browser builds it live and the hub stores the fields. */
export interface CharacterFields {
  /** What the character is: "a friendly croissant with arms and legs". */
  what: string;
  personality: string;
  /** Anything else: accessories, clothes, things to avoid. */
  extra: string;
}

export const EMPTY_CHARACTER_FIELDS: CharacterFields = { what: "", personality: "", extra: "" };

export const EXPRESSIONS = ["neutral", "happy", "laughing", "surprised", "worried", "thinking", "angry", "sad"] as const;

export interface PromptColors { background: string; text: string; accent: string; secondary: string }

export function buildImagePrompt(f: CharacterFields, c: PromptColors, brandName = ""): string {
  const lines = [
    `Draw a character reference sheet for ${brandName ? `the brand "${brandName}"` : "a brand"}.`,
    `Character: ${f.what.trim() || "(describe what the character is)"}.`,
    ...(f.personality.trim() ? [`Personality: ${f.personality.trim()}.`] : []),
    `Style: flat 2D vector illustration, simple shapes, solid colours, no gradients, no shadows, no textures, thick even outlines in ${c.text}.`,
    `Colours: main colour ${c.accent}, second colour ${c.secondary}, outlines and details ${c.text}. Use only these colours plus white.`,
    `Layout: one sheet, plain flat ${c.background} background, nothing else on it. Top row: the whole character in a neutral pose, in front view, three-quarter view and side view, all at the same height. Bottom row: the head only, with ${EXPRESSIONS.length} expressions (${EXPRESSIONS.join(", ")}), in a 4 by 2 grid.`,
    "The character must look identical in every view: same proportions, same colours, same details.",
    ...(f.extra.trim() ? [`Also: ${f.extra.trim()}.`] : []),
    "No text, no logo, no watermark.",
  ];
  return lines.join("\n");
}
