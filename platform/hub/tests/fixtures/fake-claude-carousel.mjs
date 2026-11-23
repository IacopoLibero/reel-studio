#!/usr/bin/env node
// Stand-in for the headless AI tool of carousel.make: calls the two Ootto skills, writes plan, slides, caption and carousel.json in the folder named in the prompt.
// FAKE_MODE: good | noskill | oneskill | noslides | error.
import { mkdirSync, writeFileSync } from "node:fs";
let prompt = "";
process.stdin.on("data", (d) => { prompt += d; });
process.stdin.on("end", () => {
  const out = (o) => console.log(JSON.stringify(o));
  const mode = process.env.FAKE_MODE ?? "good";
  const dir = /Work in the folder (\/[^\s,]+)/.exec(prompt)?.[1] ?? "/tmp/x";
  const n = Number(/Slides: (\d+)/.exec(prompt)?.[1] ?? 5);
  const style = /Style: (2D|3D)/.exec(prompt)?.[1]?.toLowerCase() ?? "2d";
  const tool = (name, input) => out({ type: "assistant", message: { content: [{ type: "tool_use", name, input }] } });
  out({ type: "system", subtype: "init", model: "fake" });
  if (mode === "error") { out({ type: "result", subtype: "error_during_execution", is_error: true, result: "boom" }); return; }
  if (mode !== "noskill") tool("Skill", { skill: "ootto-viral-carousel" });
  if (mode !== "noskill" && mode !== "oneskill") tool("Skill", { skill: "ootto-carousel-builder" });
  mkdirSync(`${dir}/code`, { recursive: true });
  tool("Write", { file_path: `${dir}/plan.md` }); writeFileSync(`${dir}/plan.md`, "# Plan\n");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  if (mode !== "noslides") for (let i = 1; i <= n; i++) writeFileSync(`${dir}/slide-${i}.png`, png);
  tool("Write", { file_path: `${dir}/caption.md` }); writeFileSync(`${dir}/caption.md`, "Hook 👇\n\n📌 one\n");
  writeFileSync(`${dir}/carousel.json`, JSON.stringify({ style, topic: "T", title: "Title" }));
  const text = `Made ${n} slides in ${style}.`;
  out({ type: "assistant", message: { content: [{ type: "text", text }] } });
  out({ type: "result", subtype: "success", is_error: false, result: text, total_cost_usd: 0.05 });
});
