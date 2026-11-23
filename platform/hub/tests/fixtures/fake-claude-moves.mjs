#!/usr/bin/env node
// Stand-in for the headless Claude of character.moves: writes <mascot>/<id>.py and the rendered frames (the absolute mascot path and the id are in the prompt). FAKE_MODE: good | noscript | notalk.
import { mkdirSync, writeFileSync } from "node:fs";
let prompt = "";
process.stdin.on("data", (d) => { prompt += d; });
process.stdin.on("end", () => {
  const out = (o) => console.log(JSON.stringify(o));
  const mode = process.env.FAKE_MODE ?? "good";
  const m = /Write (\/[^\s]*\/mascot)\/([a-z0-9-]+)\.py: /.exec(prompt);
  const dir = m?.[1] ?? "/tmp/x/mascot"; const id = m?.[2] ?? "character";
  const tool = (name, input) => out({ type: "assistant", message: { content: [{ type: "tool_use", name, input }] } });
  out({ type: "system", subtype: "init", model: "fake" });
  const moves = { idle: 4, talk: 3, wave: 2 };
  if (mode === "noscript") { out({ type: "result", subtype: "success", is_error: false, result: "nothing", total_cost_usd: 0 }); return; }
  tool("Write", { file_path: `${dir}/${id}.py` });
  const entries = Object.entries(moves).map(([k, v]) => `"${k}": (m_${k}, ${v})`).join(", ");
  writeFileSync(`${dir}/${id}.py`, `MOVES = {${entries}}\nLOOP_FROM = {"wave": 1}\n`);
  tool("Bash", { command: "bash scripts/slot.sh blender 1 -- blender-run" });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  for (const [k, v] of Object.entries(moves)) {
    if (mode === "notalk" && k === "talk") continue;
    mkdirSync(`${dir}/movements/${k}`, { recursive: true });
    for (let i = 1; i <= v; i++) for (const p of ["f", "o"]) writeFileSync(`${dir}/movements/${k}/${p}-${String(i).padStart(4, "0")}.png`, png);
    writeFileSync(`${dir}/movements/${k}/info.json`, JSON.stringify({ name: k, frames: v, fps: 30, size: 800 }));
  }
  out({ type: "assistant", message: { content: [{ type: "text", text: "Rigged and rendered." }] } });
  out({ type: "result", subtype: "success", is_error: false, result: "Rigged and rendered.", total_cost_usd: 0.02 });
});
