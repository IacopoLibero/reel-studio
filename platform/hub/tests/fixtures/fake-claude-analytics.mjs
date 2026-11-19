#!/usr/bin/env node
// Stand-in for headless claude in the analytics jobs: FAKE_SKILL names the skill it "calls", FAKE_ANSWER the answer.
process.stdin.on("data", () => {});
process.stdin.on("end", () => {
  const out = (o) => console.log(JSON.stringify(o));
  out({ type: "system", subtype: "init", model: "fake" });
  if (process.env.FAKE_SKILL) out({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: process.env.FAKE_SKILL } }] } });
  out({ type: "result", subtype: "success", is_error: false, result: process.env.FAKE_ANSWER ?? "" });
});
