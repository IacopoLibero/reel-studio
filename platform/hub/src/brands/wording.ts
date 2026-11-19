import type { Brand } from "./schema.js";

/** The parts of a brand the prompts quote. Optional everywhere: without it a prompt falls back to neutral wording. */
export type BrandInfo = Pick<Brand, "name" | "about" | "audience" | "language" | "readoutLanguage">;

const NAMES: Record<string, string> = { en: "English", it: "Italian", es: "Spanish", fr: "French", de: "German", pt: "Portuguese", nl: "Dutch" };
export const languageName = (code: string): string => NAMES[code.slice(0, 2).toLowerCase()] ?? code;

/** Who the reels are for, as a noun phrase: "restaurant owners" or, when the brand does not say, "the brand's audience". */
export const audienceOf = (b?: BrandInfo): string => b?.audience.trim() || "the brand's audience";

/** One line about the brand for the top of a prompt. Empty when the brand says nothing. */
export const aboutLine = (b?: BrandInfo): string => (b?.about.trim() ? `About the brand: ${b.about.trim()}\n` : "");
