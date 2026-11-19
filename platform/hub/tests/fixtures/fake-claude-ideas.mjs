#!/usr/bin/env node
// Stand-in for `claude -p --output-format stream-json`: reads the prompt, answers by FAKE_MODE.
let prompt = "";
process.stdin.on("data", (d) => { prompt += d; });
process.stdin.on("end", () => {
  const out = (o) => console.log(JSON.stringify(o));
  const mode = process.env.FAKE_MODE ?? "good";
  const n = Number(/exactly (\d+)/.exec(prompt)?.[1] ?? 1);
  out({ type: "system", subtype: "init", model: "fake" });
  out({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "brand/x/style.md" } }] } });
  if (mode !== "noskill") out({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "reel-hooks" } }] } });
  if (mode === "error") { out({ type: "result", subtype: "error_during_execution", is_error: true, result: "boom" }); return; }
  let text;
  if (mode === "prose") text = "Sorry, I could not do that.";
  else if (mode === "dups") text = JSON.stringify({ ideas: [{ question: "Is a paper menu really cheaper?", hook: "myth", source: "needs source", why: "A worry owners share.", sourceSupports: "none: tip only" }] });
  else {
    const topics = ["tablets", "napkins", "cutlery", "reservations", "deliveries", "allergens", "uniforms", "playlists"];
    const ideas = [{ question: "Is a paper menu really cheaper?", hook: "myth", source: "needs source", why: "A worry owners share.", sourceSupports: "none: tip only" }];
    ideas.push(...Array.from({ length: n }, (_, i) => ({ question: `Who is secretly judging your ${topics[i % 8]} tonight?`, hook: ["fear", "money", "number"][i % 3], source: i % 2 ? "needs source" : "improve-restaurant-efficiency", why: "Plain curiosity about a daily detail.", sourceSupports: "Post covers efficiency." })));
    text = "```json\n" + JSON.stringify({ skillsUsed: ["reel-hooks"], ideas }) + "\n```";
  }
  out({ type: "assistant", message: { content: [{ type: "text", text: "done" }] } });
  out({ type: "result", subtype: "success", is_error: false, result: text });
});
