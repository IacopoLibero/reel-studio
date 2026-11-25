#!/usr/bin/env node
// Stand-in for the headless AI tool of carousel.edit: draws slide N again (a PNG header with the size it is told), and in some modes also touches another slide.
// FAKE_MODE: good | others | wrongsize | same | error.
import { writeFileSync } from "node:fs";

let prompt = "";
process.stdin.on("data", (d) => { prompt += d; });
process.stdin.on("end", () => {
  const out = (o) => console.log(JSON.stringify(o));
  const mode = process.env.FAKE_MODE ?? "good";
  const m = /Change slide (\d+) only: (\/\S+?)slide-\d+\.png/.exec(prompt);
  const n = m?.[1] ?? "1"; const dir = m?.[2] ?? "/tmp/x/";
  const png = (w, h, tag) => { const b = Buffer.alloc(32); b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); b.write(tag, 24, "latin1"); return b; };
  out({ type: "system", subtype: "init", model: "fake" });
  if (mode === "error") { out({ type: "result", subtype: "error_during_execution", is_error: true, result: "boom" }); return; }
  out({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "npx remotion still x" } }] } });
  if (mode !== "same") writeFileSync(`${dir}slide-${n}.png`, png(mode === "wrongsize" ? 800 : 1080, mode === "wrongsize" ? 800 : 1350, `new${Date.now()}`.slice(0, 8)));
  if (mode === "others") writeFileSync(`${dir}slide-${n === "2" ? "3" : "2"}.png`, png(1080, 1350, "oops"));
  out({ type: "result", subtype: "success", is_error: false, result: `Changed slide ${n}.` });
});
