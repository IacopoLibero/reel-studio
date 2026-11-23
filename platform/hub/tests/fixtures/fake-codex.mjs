#!/usr/bin/env node
// Stand-in for `codex exec ... -`: reads the prompt on stdin and prints the answer on stdout. FAKE_MODE: ok | fail | empty | args (prints the arguments it got). FAKE_ARGS_FILE receives them.
import { appendFileSync } from "node:fs";
let prompt = "";
process.stdin.on("data", (d) => { prompt += d; });
process.stdin.on("end", () => {
  const mode = process.env.FAKE_MODE ?? process.env.CODEX_FAKE_MODE ?? "ok";
  if (process.env.FAKE_ARGS_FILE) appendFileSync(process.env.FAKE_ARGS_FILE, `${JSON.stringify(process.argv.slice(2))}\n`);
  if (mode === "env") { appendFileSync(process.env.FAKE_ARGS_FILE, JSON.stringify(Object.entries(process.env).filter(([k]) => /ANTHROPIC|HUB_TOKEN/.test(k))) + "\n"); }
  if (mode === "fail") { console.error("no network"); process.exit(3); }
  if (mode === "empty") return;
  if (mode === "echo") { console.log(JSON.stringify({ say: (/What is known about the brand[\s\S]*?How to talk/.exec(prompt)?.[0] ?? "no context").slice(0, 2900), character: { name: "Echo", what: "a heard thing" }, done: false })); return; }
  console.log(JSON.stringify({ say: `Heard ${prompt.length > 10 ? "the prompt" : "nothing"}. Name?`, summary: {}, done: false }));
});
