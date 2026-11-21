import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { skillRoutes } from "../src/routes/skills.js";

let root: string;
let app: FastifyInstance;
const SKILLS = [
  { name: "alpha", risk: "safe", reason: "", defaultEnabled: true },
  { name: "beta", risk: "outward", reason: "downloads", defaultEnabled: false },
  { name: "hid", risk: "safe", reason: "", defaultEnabled: false, hidden: true, group: "absorbed" },
];
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "ootto-route-"));
  mkdirSync(join(root, "scripts"), { recursive: true });
  copyFileSync(join(import.meta.dirname, "../../../scripts/ootto-skills.sh"), join(root, "scripts/ootto-skills.sh"));
  chmodSync(join(root, "scripts/ootto-skills.sh"), 0o755);
  mkdirSync(join(root, "platform/skills/ootto"), { recursive: true });
  writeFileSync(join(root, "platform/skills/ootto/manifest.json"), JSON.stringify({ skills: SKILLS }));
  for (const s of SKILLS) { mkdirSync(join(root, "platform/skills/ootto", s.name), { recursive: true }); writeFileSync(join(root, "platform/skills/ootto", s.name, "SKILL.md"), "x"); }
  app = fastify();
  skillRoutes(app, root, root);
  await app.ready();
});
afterEach(async () => { await app.close(); rmSync(root, { recursive: true, force: true }); });

describe("/api/skills", () => {
  it("GET lists skills and counts per risk", async () => {
    const r = await app.inject({ method: "GET", url: "/api/skills" });
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect(b.skills).toHaveLength(2);
    expect(b.skills.map((s: { name: string }) => s.name)).not.toContain("hid");
    expect(b.ours.map((s: { name: string }) => s.name)).toEqual(["reel", "reel-hooks", "reel-research", "reel-insights", "reel-threads"]);
    expect(b.counts.safe).toEqual({ total: 1, enabled: 0 });
    expect(b.counts.outward).toEqual({ total: 1, enabled: 0 });
  });
  it("POST refuses to enable a hidden skill", async () => {
    const r = await app.inject({ method: "POST", url: "/api/skills", payload: { enable: ["hid"] } });
    expect(r.statusCode).toBe(400);
  });
  it("POST validates names with a 400", async () => {
    const r = await app.inject({ method: "POST", url: "/api/skills", payload: { enable: ["nope"] } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/unknown skill/i);
  });
  it("POST refuses an outward skill without confirmation, accepts with it", async () => {
    expect((await app.inject({ method: "POST", url: "/api/skills", payload: { enable: ["beta"] } })).statusCode).toBe(400);
    const ok = await app.inject({ method: "POST", url: "/api/skills", payload: { enable: ["beta"], confirmOutward: true } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().counts.outward.enabled).toBe(1);
  });
  it("POST reset restores defaults", async () => {
    await app.inject({ method: "POST", url: "/api/skills", payload: { enable: ["beta"], confirmOutward: true } });
    const r = await app.inject({ method: "POST", url: "/api/skills/reset" });
    expect(r.json().skills.filter((s: { enabled: boolean }) => s.enabled).map((s: { name: string }) => s.name)).toEqual(["alpha"]);
  });
  it("answers 500 with a clear message when the script is missing", async () => {
    rmSync(join(root, "scripts/ootto-skills.sh"));
    const r = await app.inject({ method: "GET", url: "/api/skills" });
    expect(r.statusCode).toBe(500);
    expect(r.json().error).toMatch(/skills script/i);
  });
});
