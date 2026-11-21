#!/usr/bin/env node
// Stand-in for `claude -p --output-format stream-json` for the daily loop: answers by what the prompt asks for.
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
let prompt = "";
process.stdin.on("data", (d) => { prompt += d; });
process.stdin.on("end", () => {
  const out = (o) => console.log(JSON.stringify(o));
  const mode = process.env.FAKE_MODE ?? "good";
  const skill = (s) => out({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: s } }] } });
  out({ type: "system", subtype: "init", model: "fake" });
  let text;
  if (/You are making one finished reel/.test(prompt)) {
    const dir = /Work in the folder (brand\/[^ ]+),/.exec(prompt)?.[1];
    const root = /reel-studio project at (\S+)\./.exec(prompt)?.[1] ?? process.cwd();
    const note = /reviewer rejected .* with this note: "([^"]*)"/.exec(prompt)?.[1] ?? "";
    const abs = join(root, dir);
    mkdirSync(abs, { recursive: true });
    if (process.env.FAKE_MP4 && existsSync(process.env.FAKE_MP4)) copyFileSync(process.env.FAKE_MP4, join(abs, "reel.mp4")); else writeFileSync(join(abs, "reel.mp4"), "x");
    if (process.env.FAKE_COVER && existsSync(process.env.FAKE_COVER)) copyFileSync(process.env.FAKE_COVER, join(abs, "cover.png")); else writeFileSync(join(abs, "cover.png"), "x");
    const offer = /option A/.test(prompt) ? "\n🎁 Launch offer for new customers: use code ACMEFREE-BASE at checkout. Valid until 30 November.\n" : "\n";
    writeFileSync(join(abs, "caption.md"), `Is your menu losing you guests? 👇\n\n📌 One idea per video${offer}\nFollow for more restaurant tips.\n\n#restauranttips #acme #menu\n`);
    out({ type: "assistant", message: { content: [{ type: "tool_use", name: "Write", input: { file_path: join(abs, "caption.md") } }] } });
    text = `Closing used: fake. Checks: loudness -16 LUFS, 28 s.${note ? ` Redone after note: ${note}` : ""}`;
    out({ type: "result", subtype: "success", is_error: false, result: text });
    return;
  }
  if (/You are the analyst/.test(prompt)) {
    skill("reel-insights");
    if (mode === "analysis-fails") { out({ type: "result", subtype: "error_during_execution", is_error: true, result: "analysis boom" }); return; }
    text = JSON.stringify({ skillsUsed: ["reel-insights", "ootto-best-time-scheduler"], readout: { text: "Come sta andando: bene. Saves in crescita.", repeat: ["Domande sui prezzi: 5 salvataggi"], stop: ["Liste lunghe: 0 condivisioni"], hookPatterns: ["money: 'How much does ...'"], bestTimes: ["Tue 17:30", "19:00"] }, proposals: [{ title: "Shorter captions", target: "brand/acme/style.md", change: "Proposal: cap the caption list at 4 bullets (3 of the top 4 reels had 4).", why: "Top reels were shorter" }] });
    out({ type: "result", subtype: "success", is_error: false, result: text });
    return;
  }
  const n = Number(/propose (\d+) new reel questions/.exec(prompt)?.[1] ?? 3);
  if (mode !== "noskill") { skill("ootto-agent-reach"); skill("reel-research"); skill("reel-hooks"); skill("reel-threads"); }
  if (mode === "dups") text = JSON.stringify({ ideas: [{ question: "Is a paper menu really cheaper?", hook: "myth", source: "needs source", why: "Owners worry.", sourceSupports: "none: tip only", basedOnData: "Based on your data: money hooks win." }] });
  else {
    const topics = ["tablets", "napkins", "cutlery", "reservations", "deliveries", "allergens"];
    const ideas = Array.from({ length: n }, (_, i) => ({ question: `Who is secretly judging your ${topics[i % 6]} tonight?`, hook: ["fear", "money", "number"][i % 3], source: i % 2 ? "needs source" : "improve-restaurant-efficiency", why: "Plain curiosity about a daily detail.", sourceSupports: "Post covers efficiency.", basedOnData: "Based on your data: price questions got 5 saves.", threads: i === 0 ? "A short Threads text about napkins." : null }));
    text = JSON.stringify({ skillsUsed: ["ootto-agent-reach", "reel-research", "reel-hooks", "reel-threads"], ideas });
  }
  out({ type: "assistant", message: { content: [{ type: "text", text: "done" }] } });
  out({ type: "result", subtype: "success", is_error: false, result: "```json\n" + text + "\n```" });
});
