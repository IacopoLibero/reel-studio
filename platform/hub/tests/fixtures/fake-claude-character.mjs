#!/usr/bin/env node
// Stand-in for the headless Claude of character.build: writes plan.json and a preview PNG into <brand>/mascot/studio/ (the absolute path is in the prompt). FAKE_MODE: good | noplan | nopreview | error.
import { mkdirSync, writeFileSync } from "node:fs";
let prompt = "";
process.stdin.on("data", (d) => { prompt += d; });
process.stdin.on("end", () => {
  const out = (o) => console.log(JSON.stringify(o));
  const mode = process.env.FAKE_MODE ?? "good";
  const dir = /(\/[^\s]*\/mascot\/studio)\//.exec(prompt)?.[1] ?? "/tmp/x/mascot/studio";
  const tool = (name, input) => out({ type: "assistant", message: { content: [{ type: "tool_use", name, input }] } });
  out({ type: "system", subtype: "init", model: "fake" });
  tool("Read", { file_path: `${dir}/reference-sheet.png` });
  if (mode === "error") { out({ type: "result", subtype: "error_during_execution", is_error: true, result: "boom" }); return; }
  mkdirSync(`${dir}/previews`, { recursive: true });
  if (mode !== "noplan") { tool("Write", { file_path: `${dir}/plan.json` }); writeFileSync(`${dir}/plan.json`, JSON.stringify({ character: "Bun", summary: "A round bun with arms.", parts: [{ name: "body", shape: "sphere", color: "#d94a3d", notes: "big" }], expressions: [{ name: "happy", notes: "smile" }], limits: "Arms are simplified." })); }
  tool("Write", { file_path: `${dir}/build.py` }); writeFileSync(`${dir}/build.py`, "# fake builder\n");
  tool("Bash", { command: "bash scripts/slot.sh blender 1 -- blender-run" });
  if (mode !== "nopreview") writeFileSync(`${dir}/previews/front.png`, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
  const text = /Apply all of them/.test(prompt) ? "Built again with your notes." : "Built a first preview.";
  out({ type: "assistant", message: { content: [{ type: "text", text }] } });
  out({ type: "result", subtype: "success", is_error: false, result: text, total_cost_usd: 0.01 });
});
