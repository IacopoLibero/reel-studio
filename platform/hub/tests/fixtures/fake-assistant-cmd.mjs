#!/usr/bin/env node
// A "custom" assistant: reads the prompt on stdin and prints plain text. Argument "fail" exits with an error, "empty" prints nothing.
let prompt = "";
process.stdin.on("data", (d) => { prompt += d; });
process.stdin.on("end", () => {
  const mode = process.argv[2] ?? "ok";
  if (mode === "fail") { console.error("no network"); process.exit(3); }
  if (mode === "empty") return;
  if (mode === "echo") { console.log(JSON.stringify({ say: (/What is known about the brand[\s\S]*?How to talk/.exec(prompt)?.[0] ?? "no context").slice(0, 2900), character: { name: "Echo", what: "a heard thing" }, done: false })); return; }
  console.log(JSON.stringify({ say: `Heard ${prompt.length > 10 ? "the prompt" : "nothing"}. Name?`, summary: {}, done: false }));
});
