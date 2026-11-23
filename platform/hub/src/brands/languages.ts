/**
 * The languages the voice of the app (VoxCPM2) speaks, with the two-letter code VoiceStudio and Whisper take.
 * A brand has one: the reels are written, spoken and captioned in it.
 */
export const VOICE_LANGUAGES: readonly { code: string; name: string }[] = [
  ["ar", "Arabic"], ["my", "Burmese"], ["zh", "Chinese"], ["da", "Danish"], ["nl", "Dutch"], ["en", "English"], ["fi", "Finnish"], ["fr", "French"], ["de", "German"], ["el", "Greek"],
  ["he", "Hebrew"], ["hi", "Hindi"], ["id", "Indonesian"], ["it", "Italian"], ["ja", "Japanese"], ["km", "Khmer"], ["ko", "Korean"], ["lo", "Lao"], ["ms", "Malay"], ["no", "Norwegian"],
  ["pl", "Polish"], ["pt", "Portuguese"], ["ru", "Russian"], ["es", "Spanish"], ["sw", "Swahili"], ["sv", "Swedish"], ["tl", "Tagalog"], ["th", "Thai"], ["tr", "Turkish"], ["vi", "Vietnamese"],
].map(([code, name]) => ({ code: code as string, name: name as string })).sort((a, b) => a.name.localeCompare(b.name));

const base = (code: string): string => code.slice(0, 2).toLowerCase();

/** The name of a language code ("pt-BR" is Portuguese), or the code itself when the voice does not list it. */
export const voiceLanguageName = (code: string): string => VOICE_LANGUAGES.find((l) => l.code === base(code))?.name ?? code;

/** True for a code of a language the voice speaks (a region after the code is ignored). */
export const isVoiceLanguage = (code: string): boolean => /^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(code) && VOICE_LANGUAGES.some((l) => l.code === base(code));

const LANGUAGE_RE = /^(- The reels are written and spoken in )[^\n]*?(\.)$/m;

/** Keeps the sentence of a brand's style.md that names the language of the reels true after the language changes. Without that sentence the text is returned unchanged. */
export function withLanguageLine(md: string, code: string): string {
  return md.replace(LANGUAGE_RE, (_m, head: string, dot: string) => `${head}${voiceLanguageName(code)}${dot}`);
}
