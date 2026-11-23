#!/usr/bin/env node
// A stand-in assistant for the voice step: reads the prompt, prints three voices. CODEX_FAKE_MODE=prose prints text that is not JSON.
let prompt = "";
process.stdin.on("data", (d) => { prompt += d; });
process.stdin.on("end", () => {
  if ((process.env.CODEX_FAKE_MODE ?? "ok") === "prose") { console.log("Sure, here are some voices."); return; }
  const text = "Welcome to our little bakery, where the bread is baked every morning and the pastry is always fresh. Come by and say hello, we would love to see you.";
  const avoided = prompt.includes("do not repeat them");
  console.log(JSON.stringify({ voices: [
    { label: "Warm and calm", instruct: "female, young adult, medium pitch, warm", text },
    { label: avoided ? "Bright and quick" : "Deep and steady", instruct: "male, middle aged, low pitch, steady", text },
    { label: "Playful", instruct: "female, young adult, high pitch, playful", text },
  ] }));
});
