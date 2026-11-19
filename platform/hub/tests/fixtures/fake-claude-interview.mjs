#!/usr/bin/env node
// Stand-in for `claude -p --output-format stream-json` in the brand interview. FAKE_MODE: ask | done | prose | retry | error.
// FAKE_ARGS_FILE (optional) receives the arguments and the prompt, so a test can check the read-only tool list.
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
let prompt = "";
process.stdin.on("data", (d) => { prompt += d; });
process.stdin.on("end", () => {
  const out = (o) => console.log(JSON.stringify(o));
  const mode = process.env.FAKE_MODE ?? "ask";
  if (process.env.FAKE_ARGS_FILE) appendFileSync(process.env.FAKE_ARGS_FILE, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), prompt }) + "\n");
  out({ type: "system", subtype: "init", model: "fake" });
  if (mode === "error") { out({ type: "result", subtype: "error_during_execution", is_error: true, result: "boom" }); return; }
  let text;
  const first = !/Conversation so far/.test(prompt);
  if (mode === "prose") text = "Sure, tell me more about your brand.";
  else if (mode === "retry" && !existsSync(process.env.FAKE_STATE)) { writeFileSync(process.env.FAKE_STATE, "1"); text = "not json at all"; }
  else if (mode === "done") {
    text = JSON.stringify({
      say: "That is everything. Review the brand and press Create.", done: true, summary: { name: "Acme Bakery" },
      brand: { name: "Acme Bakery", language: "en", website: "acmebakery.example", about: "Bread and pastry.", audience: "Local families", tone: "Warm",
        colors: { background: "#f5f0e8", text: "#1a1a1a", accent: "#d94a3d", secondary: "#854dff" }, fonts: { headline: "Oswald", body: "Inter" },
        closing: { A: { label: "Try Acme Bakery", line: "Order fresh bread at acmebakery.example." }, B: { label: "Follow for tips", line: "Follow me for more baking tips." } },
        instagram: { account: "acme_bakery", profileDir: "/etc" } },
      styleMd: "# Style guide: Acme Bakery\n\n## Colours\n- warm\n",
    });
  } else text = JSON.stringify(first
    ? { say: "Hi! What is your brand called?", summary: {}, done: false }
    : { say: "Nice. What does it sell?", summary: { name: "Acme Bakery", colors: { accent: "#d94a3d" } }, done: false });
  out({ type: "assistant", message: { content: [{ type: "text", text }] } });
  out({ type: "result", subtype: "success", is_error: false, result: text });
});
