import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectInto, type ToolRunner } from "../src/analytics/collector.js";
import { cliRunner, composioBin, parseCliOutput, READ_ONLY_TOOLS } from "../src/analytics/composio.js";
import { AnalyticsError } from "../src/analytics/errors.js";
import { extractJson, runClaudeText } from "../src/analytics/claude-run.js";
import { classifyFailure, unsupportedMetric } from "../src/analytics/parse.js";
import type { HandlerCtx } from "../src/jobs/handlers.js";

const fx = (n: string): unknown => JSON.parse(readFileSync(join(import.meta.dirname, "fixtures/analytics", n), "utf8"));
let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "anb-")); });
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

function script(name: string, body: string): string {
  const p = join(tmp, name);
  writeFileSync(p, `#!/usr/bin/env node\n${body}\n`);
  chmodSync(p, 0o755);
  return p;
}

describe("composio runner", () => {
  it("finds the binary from COMPOSIO_BIN, else under HOME/.composio", () => {
    expect(composioBin({ COMPOSIO_BIN: " /x/composio " } as NodeJS.ProcessEnv)).toBe("/x/composio");
    expect(composioBin({ HOME: "/h" } as NodeJS.ProcessEnv)).toBe("/h/.composio/composio");
  });

  it("parses JSON with a banner around it and refuses anything else", () => {
    expect(parseCliOutput('{"a":1}')).toEqual({ a: 1 });
    expect(parseCliOutput('Update available\n{"a":2}\nbye')).toEqual({ a: 2 });
    expect(() => parseCliOutput("nothing here")).toThrow(AnalyticsError);
    expect(() => parseCliOutput("{broken")).toThrow(AnalyticsError);
  });

  it("only the two read tools can run: anything else is refused before any process starts", async () => {
    expect([...READ_ONLY_TOOLS].sort()).toEqual(["INSTAGRAM_GET_IG_MEDIA_INSIGHTS", "INSTAGRAM_GET_IG_USER_MEDIA"]);
    await expect(cliRunner("/does/not/matter")("INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH", {})).rejects.toThrow(/read-only/);
  });

  it("says where to mount the CLI when it is missing", async () => {
    await expect(cliRunner(join(tmp, "nope"))("INSTAGRAM_GET_IG_USER_MEDIA", {})).rejects.toThrow(/not found/);
  });

  it("returns the JSON the CLI prints, also when it exits with an error code", async () => {
    const ok = script("ok.mjs", `console.log(JSON.stringify({successful:true,args:process.argv.slice(2)}));`);
    const res = (await cliRunner(ok)("INSTAGRAM_GET_IG_USER_MEDIA", { limit: 1 })) as { successful: boolean; args: string[] };
    expect(res.successful).toBe(true);
    expect(res.args.slice(0, 2)).toEqual(["execute", "INSTAGRAM_GET_IG_USER_MEDIA"]);
    const bad = script("bad.mjs", `console.log(JSON.stringify({successful:false,error:"nope"})); process.exit(1);`);
    expect(await cliRunner(bad)("INSTAGRAM_GET_IG_USER_MEDIA", {})).toEqual({ successful: false, error: "nope" });
  });

  it("reports a CLI that prints nothing or crashes, without echoing its output", async () => {
    const silent = script("silent.mjs", `process.exit(0);`);
    await expect(cliRunner(silent)("INSTAGRAM_GET_IG_USER_MEDIA", {})).rejects.toThrow(/printed nothing/);
    const crash = script("crash.mjs", `process.stderr.write("SECRET-TOKEN-123"); process.exit(3);`);
    const err = await cliRunner(crash)("INSTAGRAM_GET_IG_USER_MEDIA", {}).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/failed to run/);
    expect((err as Error).message).not.toContain("SECRET-TOKEN-123");
  });
});

describe("failure classification", () => {
  it("recognises the cases the collector acts on", () => {
    const k = (m: string, status?: number) => classifyFailure({ successful: false, error: m, data: status ? { status_code: status } : {} }).kind;
    expect(k("anything", 429)).toBe("rate_limit");
    expect(k("Application request limit reached")).toBe("rate_limit");
    expect(k("The media does not support the reels_skip_rate metric")).toBe("unsupported");
    expect(k("Media insights are not available yet for this media")).toBe("too_early");
    expect(k("Error validating access token: session invalidated, reconnect")).toBe("connection");
    expect(k("Something odd")).toBe("other");
    expect(unsupportedMetric("does not support the plays metric")).toBe("plays");
    expect(unsupportedMetric("something else")).toBeNull();
  });
});

describe("extractJson", () => {
  it("takes the whole text, a fenced block, or the outermost braces", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('Here:\n```json\n{"a":2}\n```\nok')).toEqual({ a: 2 });
    expect(extractJson('Sure! {"a":3} done')).toEqual({ a: 3 });
    expect(() => extractJson("no json at all")).toThrow(/not valid JSON/);
    expect(() => extractJson("")).toThrow(/\(empty\)/);
  });
});

describe("runClaudeText", () => {
  const ctx = (bin: string, signal = new AbortController().signal): HandlerCtx => ({
    claudeBin: bin, root: tmp, signal, settings: { claudeModel: "sonnet", blenderDevice: "cpu" }, update: () => undefined,
  } as unknown as HandlerCtx);
  const fakeClaude = (events: unknown[], exit = 0) => script("claude.mjs", `process.stdin.on("data",()=>{});process.stdin.on("end",()=>{for (const e of ${JSON.stringify(events)}) console.log(JSON.stringify(e)); process.exit(${exit});});`);
  const skill = (s: string) => ({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: s } }, { type: "text", text: "thinking" }] } });
  const tool = { type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/a" } }] } };
  const done = (text: string, err = false) => ({ type: "result", subtype: err ? "error" : "success", is_error: err, result: text });

  it("returns the answer and the skills really called, once each, with the slash removed", async () => {
    const bin = fakeClaude([{ type: "system", subtype: "init", model: "m" }, skill("/reel-insights"), skill("reel-insights"), tool, done("ready")]);
    const r = await runClaudeText(ctx(bin));
    expect(r).toEqual({ answer: "ready", skills: ["reel-insights"] });
  });

  it("fails clearly on an error result, an empty answer and a cancelled job", async () => {
    await expect(runClaudeText(ctx(fakeClaude([done("it broke", true)])))).rejects.toThrow(/reported an error: it broke/);
    await expect(runClaudeText(ctx(fakeClaude([done("   ")])))).rejects.toThrow(/returned no answer/);
    const ac = new AbortController(); ac.abort();
    await expect(runClaudeText(ctx(fakeClaude([done("x")]), ac.signal))).rejects.toThrow(/Cancelled/);
  });
});

describe("collector under Instagram failures", () => {
  let root: string, data: string;
  beforeEach(() => {
    root = join(tmp, "root"); data = join(tmp, "data");
    mkdirSync(join(root, "brand/acme"), { recursive: true }); mkdirSync(data);
    writeFileSync(join(root, "brand/acme/reel-questions.md"), "## Done\n");
  });
  const opts = () => ({ root, brand: "acme", dataDir: data, igUserId: "42", timezone: "Europe/Rome", now: new Date("2026-11-19T12:00:00Z") });
  const listThen = (insights: (id: string, metrics: string[]) => unknown): ToolRunner => async (slug, args) =>
    slug === "INSTAGRAM_GET_IG_USER_MEDIA" ? fx("media-list.json") : insights(String(args.ig_media_id), args.metric as string[]);
  const snapshot = (p: string) => JSON.parse(readFileSync(p, "utf8")) as { warnings: string[]; media: Array<{ id: string; insights: string; productType?: string }> };

  it("keeps going with a warning when Instagram rate-limits the insights", async () => {
    const out = await collectInto(listThen(() => ({ successful: false, error: "Application request limit reached" })), opts());
    const s = snapshot(out.snapshotPath);
    expect(s.warnings.join(" ")).toMatch(/rate limit/i);
    expect(out.mediaCount).toBe(4);
  });

  it("keeps going with a warning when one reel fails for another reason", async () => {
    const out = await collectInto(listThen(() => ({ successful: false, error: "Weird server error 500" })), opts());
    expect(snapshot(out.snapshotPath).warnings.join(" ")).toMatch(/Insights failed for one reel/);
  });

  it("stops with the fix when the Composio connection is invalid", async () => {
    await expect(collectInto(listThen(() => ({ successful: false, error: "Error validating access token: session invalidated, reconnect" })), opts()))
      .rejects.toThrow(/composio link instagram/);
  });

  it("marks reels whose insights are not ready yet", async () => {
    const out = await collectInto(listThen(() => ({ successful: false, error: "Media insights are not available yet for this media" })), opts());
    expect(snapshot(out.snapshotPath).media.some((m) => m.insights === "too_early")).toBe(true);
  });
});
