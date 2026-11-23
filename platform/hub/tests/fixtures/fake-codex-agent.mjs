#!/usr/bin/env node
// Stand-in for `codex exec --json ... -` in a character.build run: writes plan.json, build.py and a preview, and prints Codex's JSON Lines events.
// FAKE_ARGS_FILE receives the arguments and the prompt.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
let prompt = "";
process.stdin.on("data", (d) => { prompt += d; });
process.stdin.on("end", () => {
  const out = (o) => console.log(JSON.stringify(o));
  if (process.env.FAKE_ARGS_FILE) appendFileSync(process.env.FAKE_ARGS_FILE, `${JSON.stringify({ args: process.argv.slice(2), prompt })}\n`);
  const dir = /(\/[^\s]*\/mascot\/studio)\//.exec(prompt)?.[1] ?? "/tmp/x/mascot/studio";
  out({ type: "thread.started", thread_id: "thr-7" });
  out({ type: "turn.started" });
  out({ type: "item.started", item: { id: "a", type: "command_execution", command: `cat ${dir}/reference-sheet.png`, status: "in_progress" } });
  mkdirSync(`${dir}/previews`, { recursive: true });
  writeFileSync(`${dir}/plan.json`, JSON.stringify({ character: "Bun", summary: "A round bun.", parts: [{ name: "body", shape: "sphere", color: "#d94a3d", notes: "big" }], expressions: [], limits: "" }));
  out({ type: "item.started", item: { id: "b", type: "file_change", changes: [{ path: `${dir}/build.py`, kind: "add" }] } });
  writeFileSync(`${dir}/build.py`, "# fake\n");
  out({ type: "item.started", item: { id: "c", type: "command_execution", command: "bash scripts/slot.sh blender 1 -- blender-run -b -P build.py", status: "in_progress" } });
  writeFileSync(`${dir}/previews/front.png`, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
  out({ type: "item.completed", item: { id: "d", type: "agent_message", text: "Built a first preview with Codex." } });
  out({ type: "turn.completed", usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5, reasoning_output_tokens: 0 } });
});
