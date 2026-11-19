#!/usr/bin/env node
// A "custom" assistant: reads the prompt on stdin and prints plain text. Argument "fail" exits with an error, "empty" prints nothing.
let prompt = "";
process.stdin.on("data", (d) => { prompt += d; });
process.stdin.on("end", () => {
  const mode = process.argv[2] ?? "ok";
  if (mode === "fail") { console.error("no network"); process.exit(3); }
  if (mode === "empty") return;
  console.log(JSON.stringify({ say: `Heard ${prompt.length > 10 ? "the prompt" : "nothing"}. Name?`, summary: {}, done: false }));
});
