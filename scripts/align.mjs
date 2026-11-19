// Build words.json: exact sentence times from the joined files, word times inside each sentence from Whisper.
// usage: node scripts/align.mjs <reelDir> <voice> <gapSec> "<sentence1>" "<sentence2>" ...
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const [, , dir, voice, gapArg, ...sentences] = process.argv;
const gap = Number(gapArg);
const dur = (f) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());

const whisper = JSON.parse(fs.readFileSync(`${dir}/audio/${voice}-captions.json`, "utf8"))
  .map((c) => ({ ...c, text: c.text.trim() }))
  .filter((c) => /[\p{L}\p{N}]/u.test(c.text));

let t = 0;
let w = 0;
const out = sentences.map((text, i) => {
  const words = text.split(/\s+/);
  const start = t;
  const end = t + dur(`${dir}/audio/n-${voice}-${i}.wav`);
  t = end + gap;
  const heard = whisper.slice(w, w + words.length);
  w += words.length;
  if (heard.length !== words.length) throw new Error(`sentence ${i}: ${words.length} script words, ${heard.length} heard`);
  const span = heard[heard.length - 1].endMs - heard[0].startMs;
  const scale = ((end - start) * 1000) / span;
  const timed = words.map((word, k) => {
    const s = start * 1000 + (heard[k].startMs - heard[0].startMs) * scale;
    const e = start * 1000 + (heard[k].endMs - heard[0].startMs) * scale;
    return { word, startMs: Math.round(s), endMs: Math.round(e) };
  });
  return { text, startMs: Math.round(start * 1000), endMs: Math.round(end * 1000), words: timed };
});
fs.writeFileSync(`${dir}/audio/${voice}-words.json`, JSON.stringify({ voice, totalMs: Math.round(t * 1000 - gap * 1000), sentences: out }, null, 2));
console.log(voice, "total ms", Math.round(t * 1000 - gap * 1000), out.map((s) => `${s.startMs}-${s.endMs}`).join(" | "));
