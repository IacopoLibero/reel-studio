import type { Brand } from "./schema.js";

/** The {{TOKENS}} of brand/_template/*.md filled from a brand. Tokens the brand cannot answer (a mascot description) stay for the person to write. */
export function templateValues(b: Brand): Record<string, string> {
  return {
    BRAND: b.slug, BRAND_NAME: b.name, WEBSITE: b.website || "your website",
    BACKGROUND_HEX: b.colors.background, TEXT_HEX: b.colors.text, ACCENT_HEX: b.colors.accent, SECOND_ACCENT_HEX: b.colors.secondary,
    HEADLINE_FONT: b.fonts.headline, BODY_FONT: b.fonts.body,
    OFFER_NAME: b.closing.A.label, CLOSING_A_LINE: b.closing.A.line, CLOSING_B_LINE: b.closing.B.line,
    VOICE_NAME: b.character.enabled && b.character.name ? b.character.name : "the narrator",
    LOGO_PATH: `brand/${b.slug}/identity/logo.png`,
    // The voice files without their extension: the character's own voice when the brand has one, else the brand's.
    VOICE_BASE: b.character.enabled ? `brand/${b.slug}/mascot/${b.character.id}-voice` : `brand/${b.slug}/identity/voice`,
  };
}

export function fillTemplate(text: string, b: Brand): string {
  const v = templateValues(b);
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (m, k: string) => v[k] ?? m);
}
