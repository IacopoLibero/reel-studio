import fs from "node:fs";
import path from "node:path";

/**
 * The language a reel is spoken and timed in: the `language` of its brand (`<brand>/identity/brand.json`; the reel folder is `<brand>/reels/<n>-<name>`),
 * as the two-letter code VoiceStudio and Whisper take. REEL_LANGUAGE overrides it; anything unreadable or odd means English.
 */
export function brandLanguage(reelDir, env = process.env) {
  const asked = String(env.REEL_LANGUAGE ?? "").trim().toLowerCase();
  const code = asked || (() => {
    try {
      const brandDir = path.dirname(path.dirname(path.resolve(reelDir)));
      return String(JSON.parse(fs.readFileSync(path.join(brandDir, "identity", "brand.json"), "utf8")).language ?? "");
    } catch { return ""; }
  })();
  const base = code.slice(0, 2).toLowerCase();
  return /^[a-z]{2}$/.test(base) ? base : "en";
}

/** Digits the script may write as words, for matching the script against what Whisper heard. Only English has the table. */
export const numberWords = (lang) => (lang === "en" ? { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten", 14: "fourteen" } : {});

/**
 * Whisper gives pieces of words ("raff", "ermo"), and the space in front of a piece marks the start of a word. This puts the pieces of a word back together
 * (a word starts at its first piece, ends at the end of its last), so a word is compared with the script as a word. Pieces with no letter or digit, such as
 * a full stop, join the word before them.
 */
export function mergeTokens(captions) {
  const words = [];
  for (const c of captions) {
    const raw = String(c.text ?? "");
    const text = raw.trim();
    if (!text) continue;
    const last = words[words.length - 1];
    if (last && (!/^\s/.test(raw) || !/[\p{L}\p{N}]/u.test(text))) { last.text += text; last.endMs = c.endMs; }
    else words.push({ text, startMs: c.startMs, endMs: c.endMs });
  }
  return words.filter((w) => /[\p{L}\p{N}]/u.test(w.text));
}
