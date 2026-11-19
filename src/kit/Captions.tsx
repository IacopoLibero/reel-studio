import React from "react";
import { useCurrentFrame } from "remotion";
import { C, inter, msToFrame, pop, SAFE, CONTENT_W, H, Sentence } from "./theme";

type Line = { words: { word: string; start: number; end: number }[]; start: number; end: number };

const MAX_CHARS = 20;
const chars = (ws: { word: string }[]) => ws.reduce((a, w) => a + w.word.length, 0) + Math.max(0, ws.length - 1);

/** Break a sentence into lines of 2 to 4 words (at most 20 characters), preferring breaks after punctuation. */
export const toLines = (s: Sentence): Line[] => {
  const lines: Line[] = [];
  let cur: Line["words"] = [];
  const flush = () => {
    if (!cur.length) return;
    lines.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end });
    cur = [];
  };
  s.words.forEach((w, i) => {
    const next = { word: w.word, start: msToFrame(w.startMs), end: msToFrame(w.endMs) };
    if (cur.length >= 2 && chars([...cur, next]) > MAX_CHARS) flush();
    cur.push(next);
    const punct = /[.,?!:]$/.test(w.word);
    const rest = s.words.length - i - 1;
    if (cur.length >= 4 || (punct && cur.length >= 2 && rest !== 1)) flush();
  });
  flush();
  return lines;
};

/** Font size that keeps a line inside the safe width. */
const sizeFor = (line: Line) => Math.min(78, Math.floor((CONTENT_W - 22 * (line.words.length - 1)) / (chars(line.words) * 0.56)));

export const Captions: React.FC<{ sentences: Sentence[]; totalFrames: number }> = ({ sentences, totalFrames }) => {
  const frame = useCurrentFrame();
  const lines = sentences.flatMap(toLines);
  const idx = lines.findIndex((l, i) => frame >= l.start && (i === lines.length - 1 || frame < lines[i + 1].start));
  if (idx < 0) return null;
  const line = lines[idx];
  const visible = frame < totalFrames;
  return (
    <div
      style={{
        position: "absolute",
        left: SAFE.left,
        width: CONTENT_W,
        top: H - SAFE.bottom - 250,
        height: 200,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 22,
        fontFamily: inter,
        fontWeight: 800,
        fontSize: sizeFor(line),
        opacity: visible ? 1 : 0,
      }}
    >
      {line.words.map((w, i) => {
        const shown = frame >= w.start;
        const active = frame >= w.start && frame < w.end + 3;
        const p = shown ? pop(frame, w.start) : 0;
        return (
          <span
            key={i}
            style={{
              color: active ? C.red : C.ink,
              opacity: shown ? 1 : 0,
              transform: `scale(${0.85 + 0.15 * p}) translateY(${(1 - p) * 14}px)`,
              display: "inline-block",
            }}
          >
            {w.word}
          </span>
        );
      })}
    </div>
  );
};
