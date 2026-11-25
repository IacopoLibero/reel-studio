import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

/** Instagram's own limit for one alt text is 100 characters in the app; the AI is asked to stay under it. */
export const ALT_MAX = 100;

const altFile = z.array(z.string().trim().max(ALT_MAX * 2)).max(20);

/** The alt texts of a carousel (alt.json: one string per slide, in order), cut to the limit, or null when there is no usable file. */
export function readAltTexts(dir: string, slideCount: number): string[] | null {
  try {
    const parsed = altFile.safeParse(JSON.parse(readFileSync(join(dir, "alt.json"), "utf8")));
    if (!parsed.success || parsed.data.length !== slideCount) return null;
    return parsed.data.map((a) => (a.length > ALT_MAX ? `${a.slice(0, ALT_MAX - 1).trimEnd()}…` : a));
  } catch { return null; }
}
