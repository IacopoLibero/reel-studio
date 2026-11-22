#!/usr/bin/env node
// Stand-in for headless Claude of reel.edit. FAKE_MODE: good | resume-lost | error | delete | question.
// Reads the prompt on stdin, finds the reel folder in it, records the arguments and the prompt in $FAKE_LOG (one JSON per run), and "edits" the MP4.
import { appendFileSync, existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
let prompt = "";
process.stdin.on("data", (d) => { prompt += d; });
process.stdin.on("end", () => {
  const args = process.argv.slice(2);
  const out = (o) => console.log(JSON.stringify(o));
  const mode = process.env.FAKE_MODE ?? "good";
  if (process.env.FAKE_LOG) appendFileSync(process.env.FAKE_LOG, `${JSON.stringify({ args, prompt })}\n`);
  const dir = /(\/[^\s`]*\/reels\/\d+-[a-z0-9-]+)/.exec(prompt)?.[1];
  const resumeId = args.includes("--resume") ? args[args.indexOf("--resume") + 1] : null;
  if (mode === "resume-lost" && resumeId) { console.error("No conversation found with session ID: " + resumeId); process.exit(1); }
  out({ type: "system", subtype: "init", model: "fake", session_id: "sess-" + (resumeId ? "again" : "one") });
  out({ type: "assistant", message: { content: [{ type: "text", text: "Looking at the reel." }, { type: "tool_use", name: "Read", input: { file_path: `${dir}/script.json` } }] } });
  if (mode === "error") { out({ type: "result", subtype: "error_during_execution", is_error: true, result: "boom" }); return; }
  if (mode === "question") { out({ type: "result", subtype: "success", result: "The hook is 120 px tall." }); return; }
  const mp4 = readdirSync(dir).find((f) => f.endsWith(".mp4"));
  out({ type: "assistant", message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: `${dir}/code/Scenes.tsx` } }] } });
  if (mode === "delete") { rmSync(`${dir}/${mp4}`); out({ type: "result", subtype: "success", result: "I removed it by mistake." }); return; }
  out({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "bash scripts/slot.sh render 3 -- npx remotion render x" } }] } });
  writeFileSync(`${dir}/${mp4}`, "edited video");
  out({ type: "result", subtype: "success", result: "Made the hook 20% bigger." });
});
