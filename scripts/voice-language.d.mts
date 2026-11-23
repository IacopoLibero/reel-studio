export function brandLanguage(reelDir: string, env?: Record<string, string | undefined>): string;
export function numberWords(lang: string): Record<number, string>;
export function mergeTokens(captions: { text: string; startMs: number; endMs: number }[]): { text: string; startMs: number; endMs: number }[];
