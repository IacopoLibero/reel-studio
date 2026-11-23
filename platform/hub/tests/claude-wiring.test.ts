import { afterEach, describe, expect, it } from "vitest";
import { jobEnv, setEnvLayer } from "../src/env.js";
import { runProcess, setProcessTap } from "../src/jobs/process.js";
import { DEFAULT_SETTINGS } from "../src/settings.js";

afterEach(() => { setEnvLayer("claude", null); setEnvLayer("codex", null); setProcessTap(null); });

describe("jobEnv with an environment layer", () => {
  it("applies the layer last, after the hub token is removed and the brand set", () => {
    setEnvLayer("claude", (env) => ({ ...env, ANTHROPIC_API_KEY: "sk-ant-layer", CHANGED: "yes" }));
    const env = jobEnv(DEFAULT_SETTINGS, "acme", { HUB_TOKEN: "secret", PATH: "/bin" });
    expect(env).toMatchObject({ ANTHROPIC_API_KEY: "sk-ant-layer", CHANGED: "yes", REEL_BRAND: "acme", PATH: "/bin" });
    expect(env.HUB_TOKEN).toBeUndefined();
  });
  it("is unchanged without a layer", () => {
    expect(jobEnv(DEFAULT_SETTINGS, null, { PATH: "/bin" })).toMatchObject({ PATH: "/bin", BLENDER_DEVICE: DEFAULT_SETTINGS.blenderDevice });
  });
});

describe("runProcess tap", () => {
  const run = (script: string) => runProcess({ cmd: "node", args: ["-e", script], cwd: process.cwd(), env: process.env, signal: new AbortController().signal, onLine: () => {} });
  it("gives the tap the lines that may carry usage, and only those", async () => {
    const seen: string[] = [];
    setProcessTap((line) => seen.push(line));
    await run(`console.log("hello"); console.log('{"type":"rate_limit_event"}'); console.log('{"type":"result","total_cost_usd":1}'); console.error('{"type":"rate_limit_event"}')`);
    expect(seen).toEqual(['{"type":"rate_limit_event"}', '{"type":"result","total_cost_usd":1}']);
  });
  it("does not break the run when the tap throws", async () => {
    setProcessTap(() => { throw new Error("boom"); });
    await expect(run(`console.log('{"type":"rate_limit_event"}')`)).resolves.toBe(0);
  });
});
