/** WCAG contrast between two #rrggbb colours, used by the brand form (browser) and the validation tests. */
const channel = (v: number): number => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };

export const isHex = (s: string): boolean => /^#[0-9a-fA-F]{6}$/.test(s);

export function luminance(hex: string): number {
  const p = (i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return 0.2126 * channel(p(0)) + 0.7152 * channel(p(1)) + 0.0722 * channel(p(2));
}

/** 1 (identical) to 21 (black on white). Zero for a value that is not a hex colour. */
export function contrastRatio(a: string, b: string): number {
  if (!isHex(a) || !isHex(b)) return 0;
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export type ContrastLevel = "good" | "large-text-only" | "poor";

/** AA for body text is 4.5, AA for large text (reel headlines) is 3. */
export function contrastLevel(ratio: number): ContrastLevel {
  return ratio >= 4.5 ? "good" : ratio >= 3 ? "large-text-only" : "poor";
}
