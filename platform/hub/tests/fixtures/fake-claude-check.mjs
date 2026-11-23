#!/usr/bin/env node
// Stand-in for Claude in the access check. FAKE_MODE: good | auth
let prompt = "";
process.stdin.on("data", (d) => { prompt += d; });
process.stdin.on("end", () => {
  const out = (o) => console.log(JSON.stringify(o));
  out({ type: "system", subtype: "init", model: "fake", session_id: "s" });
  if (process.env.FAKE_MODE === "auth") { out({ type: "result", subtype: "success", is_error: true, result: "Invalid API key · Please run /login" }); process.exit(1); }
  out({ type: "rate_limit_event", rate_limit_info: { status: "allowed", rateLimitType: "five_hour", unifiedWindows: { five_hour: { utilization: 0.4, resetsAt: 1795401000, status: "allowed" }, seven_day: { utilization: 0.2, resetsAt: 1796083200, status: "allowed" } } } });
  out({ type: "assistant", message: { content: [{ type: "text", text: "ok" }] } });
  out({ type: "result", subtype: "success", is_error: false, result: "ok", total_cost_usd: 0.05 });
});
