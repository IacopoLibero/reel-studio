// Make the voice for a reel: one sentence at a time (VoiceStudio, cloned from a saved sample),
// join with pauses, time every word with Whisper, write <voice>-props.json for Remotion.
// usage: node scripts/voice.mjs <reelDir> <voiceName>=<refWav> [<voiceName>=<refWav> ...]
// the words spoken in <refWav> go in the file next to it with the same name and .txt
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { transcribe, toCaptions } from "@remotion/install-whisper-cpp";
import { brandLanguage, mergeTokens, numberWords } from "./voice-language.mjs";

const GAP = 0.3;
const BASE = `http://localhost:${process.env.VOICE_PORT || 3900}`;
// The hub starts and watches VoiceStudio. If it does not answer, say so and stop: do not start another copy.
const up = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(5000) }).then((r) => r.ok, () => false);
if (!up) throw new Error(`VoiceStudio does not answer on ${BASE}. It is started by the Reel Studio app (open the app and finish the Voice step of the setup), then run this again.`);
// Reference text: the words spoken in the sample, read from <sample>.txt next to the wav (each brand keeps its own).
const refTextOf = (wav) => {
  const txt = wav.replace(/\.wav$/i, ".txt");
  if (!fs.existsSync(txt)) throw new Error(`Missing ${txt}: write the exact words spoken in ${wav} in that file.`);
  return fs.readFileSync(txt, "utf8").trim();
};
// Optional voice settings next to the sample (<sample>.json): { "speed": 0.82, "gap": 0.45 }.
// speed < 1 slows every sentence with ffmpeg (pitch is kept); gap is the pause between sentences in seconds.
const settingsOf = (wav) => {
  const f = wav.replace(/\.wav$/i, ".json");
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
};
const [, , dirArg, ...voiceArgs] = process.argv;
const dir = path.resolve(dirArg);
// The brand decides the language (Settings > Voice): the voice speaks it and Whisper listens for it.
const LANG = brandLanguage(dir);
console.log(`language: ${LANG}`);
const name = path.basename(dir);
const audioDir = path.join(dir, "audio");
fs.mkdirSync(audioDir, { recursive: true });
// script.json: sentences are strings, or { "text": shown in captions, "spoken": what the voice says } when they differ
const raw = JSON.parse(fs.readFileSync(path.join(dir, "script.json"), "utf8")).sentences;
const sentences = raw.map((x) => (typeof x === "string" ? x : x.text));
const spokenOf = raw.map((x) => (typeof x === "string" ? x : x.spoken || x.text));

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr || r.stdout}`);
  return r.stdout;
};
const duration = (f) => Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]));

const REUSE = process.env.REUSE === "1"; // reuse audio + Whisper output already on disk (re-run alignment only)
const speak = (text, ref, out) => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = spawnSync("curl", ["-s", "-m", "280", "-o", out, "-w", "%{http_code}", `${BASE}/generate`,
      "-F", `text=${text}`, "-F", `language=${LANG}`, "-F", `ref_audio=@${ref}`, "-F", `ref_text=${refTextOf(ref)}`, "-F", "guidance_scale=1.6"], { encoding: "utf8" });
    if (r.stdout.trim() === "200") return;
    console.log(`  retry ${attempt} (http ${r.stdout.trim()})`);
  }
  throw new Error(`could not speak: ${text}`);
};

const words = (s) => s.split(/\s+/).filter(Boolean);

for (const arg of voiceArgs) {
  const [voice, ref] = arg.split("=");
  const settings = settingsOf(ref);
  const speed = Math.min(2, Math.max(0.5, Number(settings.speed ?? 1)));
  const GAP_S = Number(settings.gap ?? GAP);
  console.log("voice", voice, `speed ${speed}`, `gap ${GAP_S}s`);
  const parts = sentences.map((text, i) => {
    const raw = path.join(audioDir, `${voice}-${i}.wav`);
    const norm = path.join(audioDir, `n-${voice}-${i}.wav`);
    if (!(REUSE && fs.existsSync(norm))) speak(spokenOf[i], ref, raw);
    if (!(REUSE && fs.existsSync(norm))) run("ffmpeg", ["-v", "error", "-y", "-i", raw, ...(speed !== 1 ? ["-af", `atempo=${speed}`] : []), "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", norm]);
    return norm;
  });
  const gap = path.join(audioDir, "gap.wav");
  run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", String(GAP_S), "-c:a", "pcm_s16le", gap]);
  const list = parts.flatMap((p, i) => (i < parts.length - 1 ? [`file '${p}'`, `file '${gap}'`] : [`file '${p}'`])).join("\n");
  fs.writeFileSync(path.join(audioDir, `list-${voice}.txt`), list);
  const joined = path.join(audioDir, `${voice}.wav`);
  run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", path.join(audioDir, `list-${voice}.txt`), "-c:a", "pcm_s16le", joined]);
  const k16 = path.join(audioDir, `${voice}-16k.wav`);
  run("ffmpeg", ["-v", "error", "-y", "-i", joined, "-ar", "16000", "-ac", "1", k16]);

  const capFile = path.join(audioDir, `${voice}-captions.json`);
  let heard;
  if (REUSE && fs.existsSync(capFile)) heard = JSON.parse(fs.readFileSync(capFile, "utf8"));
  else {
    const result = await transcribe({ inputPath: k16, whisperPath: path.resolve("whisper.cpp"), whisperCppVersion: "1.5.5", model: "medium", tokenLevelTimestamps: true, language: LANG });
    heard = mergeTokens(toCaptions({ whisperCppOutput: result }).captions);
    fs.writeFileSync(capFile, JSON.stringify(heard, null, 2));
  }

  // Whisper's own clock drifts from the real one, so match script words to heard words over the whole script
  // (longest common subsequence), then place each sentence on its exact start and end from the files.
  const NUM = numberWords(LANG);
  const norm = (w) => { const x = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""); return NUM[x] || x; };
  const flat = sentences.flatMap((t, si) => words(t).map((w, wi) => ({ si, wi, n: norm(w) })));
  const H = heard.map((h) => norm(h.text));
  const L = Array.from({ length: flat.length + 1 }, () => new Array(H.length + 1).fill(0));
  for (let i = flat.length - 1; i >= 0; i--) for (let j = H.length - 1; j >= 0; j--)
    L[i][j] = flat[i].n === H[j] && flat[i].n ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const match = new Array(flat.length).fill(-1);
  for (let i = 0, j = 0; i < flat.length && j < H.length; ) {
    if (flat[i].n && flat[i].n === H[j]) { match[i] = j; i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }

  let t = 0;
  let k0 = 0;
  const out = sentences.map((text, i) => {
    const ws = words(text);
    const start = t;
    const end = t + duration(parts[i]);
    t = end + GAP_S;
    const idx = ws.map((_, wi) => k0 + wi);
    k0 += ws.length;
    const anchors = idx.map((g, wi) => ({ wi, h: match[g] })).filter((a) => a.h >= 0);
    let timed;
    if (anchors.length >= 2) {
      // heard time of word wi: anchor time, or interpolated between anchors by letters
      const hs = (wi) => heard[match[idx[wi]]].startMs;
      const he = (wi) => heard[match[idx[wi]]].endMs;
      const lens = ws.map((w) => w.length + 1);
      const first = anchors[0], last = anchors[anchors.length - 1];
      const rate = (he(last.wi) - hs(first.wi)) / lens.slice(first.wi, last.wi + 1).reduce((a, b) => a + b, 0);
      const hFirst = hs(first.wi) - rate * lens.slice(0, first.wi).reduce((a, b) => a + b, 0);
      const hLast = he(last.wi) + rate * lens.slice(last.wi + 1).reduce((a, b) => a + b, 0);
      const mapT = (x) => Math.min(end * 1000, Math.max(start * 1000, start * 1000 + ((x - hFirst) / (hLast - hFirst)) * (end - start) * 1000));
      const raw = ws.map((_, wi) => {
        const a = anchors.find((q) => q.wi === wi);
        return a ? { s: hs(wi), e: he(wi) } : null;
      });
      // fill words with no match between their neighbours, by letters
      for (let wi = 0; wi < ws.length; wi++) {
        if (raw[wi]) continue;
        let p = wi - 1; while (p >= 0 && !raw[p]) p--;
        let n = wi + 1; while (n < ws.length && !raw[n]) n++;
        const from = p >= 0 ? raw[p].e : hFirst;
        const to = n < ws.length ? raw[n].s : hLast;
        const gapIdx = []; for (let q = p + 1; q < n; q++) gapIdx.push(q);
        const tot = gapIdx.reduce((a, q) => a + lens[q], 0);
        let c = from;
        for (const q of gapIdx) { const d = ((to - from) * lens[q]) / tot; raw[q] = { s: c, e: c + d }; c += d; }
      }
      timed = ws.map((word, wi) => ({ word, startMs: Math.round(mapT(raw[wi].s)), endMs: Math.round(mapT(raw[wi].e)) }));
    } else {
      console.log(`  sentence ${i}: only ${anchors.length} words matched, spreading by length`);
      const total = ws.reduce((a, w) => a + w.length + 1, 0);
      let c = start * 1000;
      timed = ws.map((word) => { const d = ((end - start) * 1000 * (word.length + 1)) / total; const o = { word, startMs: Math.round(c), endMs: Math.round(c + d) }; c += d; return o; });
    }
    console.log(`  sentence ${i}: ${anchors.length}/${ws.length} words matched`);
    return { text, startMs: Math.round(start * 1000), endMs: Math.round(end * 1000), words: timed };
  });
  const totalMs = Math.round((t - GAP_S) * 1000);
    // The audio stays in <reel folder>/audio/. Remotion reads it as <name>/<voice>.wav: remotion.config.ts builds that path for the brand (scripts/brand-public.ts).
  fs.writeFileSync(path.join(dir, `${voice}-props.json`), JSON.stringify({ audio: `${name}/${voice}.wav`, totalMs, sentences: out }));
  console.log(voice, "total", totalMs, "ms", out.map((s) => `${s.startMs}-${s.endMs}`).join(" | "));
}
