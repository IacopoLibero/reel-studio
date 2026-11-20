import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ASSISTANT_ALLOWED_TOOLS, assistantDenied, assistantEnv, runAssistant, splitCommand, type AssistantRun } from "../src/creator/assistant.js";
import { buildInterviewPrompt, interviewTurn, makeDraft, parseTurn } from "../src/creator/interview.js";

const FX = join(import.meta.dirname, "fixtures");
const CLAUDE = join(FX, "fake-claude-interview.mjs");
const CMD = join(FX, "fake-assistant-cmd.mjs");
let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "assist-")); });
afterEach(() => { for (const k of ["FAKE_MODE", "FAKE_ARGS_FILE", "FAKE_STATE"]) delete process.env[k]; rmSync(tmp, { recursive: true, force: true }); });

const base = (over: Partial<AssistantRun> = {}): AssistantRun => ({
  config: { kind: "claude", command: "" }, claudeBin: CLAUDE, model: "", prompt: "hello there prompt", root: "/project", scratch: join(tmp, "scratch"), env: { ...process.env, HUB_TOKEN: "SECRET-TOKEN" }, extraEnv: Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith("FAKE_"))), ...over,
});

describe("splitCommand", () => {
  it("splits words and honours quotes, without a shell", () => {
    expect(splitCommand("codex exec -")).toEqual(["codex", "exec", "-"]);
    expect(splitCommand(`my-tool --name "two words" 'a b' ""`)).toEqual(["my-tool", "--name", "two words", "a b", ""]);
    expect(splitCommand("  ")).toEqual([]);
    expect(splitCommand("a; rm -rf /")).toEqual(["a;", "rm", "-rf", "/"]);
    expect(() => splitCommand('a "b')).toThrow(/quote/);
  });
});

describe("the claude adapter", () => {
  it("runs one headless turn with read-only tools, no secrets and an empty scratch folder", async () => {
    process.env.FAKE_ARGS_FILE = join(tmp, "args.jsonl");
    const text = await runAssistant(base({ model: "sonnet" }));
    expect(JSON.parse(text).say).toContain("brand called");
    const rec = JSON.parse(readFileSync(process.env.FAKE_ARGS_FILE, "utf8").trim());
    const arg = (flag: string) => rec.args[rec.args.indexOf(flag) + 1] as string;
    expect(rec.args).toContain("-p");
    expect(arg("--allowedTools")).toBe(ASSISTANT_ALLOWED_TOOLS);
    expect(arg("--allowedTools")).not.toMatch(/Bash|Write|Edit/);
    for (const d of ["Bash", "Write", "Edit", "Read(**/.env)", "Read(/project/brand/**)", "Read(/project/platform/data/**)", "Read(/project/reels/**)"]) expect(arg("--disallowedTools").split(",")).toContain(d);
    expect(arg("--model")).toBe("sonnet");
    expect(rec.cwd.endsWith("scratch")).toBe(true);
    expect(rec.prompt).toBe("hello there prompt");
  });
  it("never passes the hub token to the child", async () => {
    process.env.FAKE_MODE = "ask";
    const saved = process.env.HUB_TOKEN; process.env.HUB_TOKEN = "SECRET-TOKEN";
    process.env.FAKE_ARGS_FILE = join(tmp, "a.jsonl");
    await runAssistant(base());
    expect(readFileSync(process.env.FAKE_ARGS_FILE, "utf8")).not.toContain("SECRET-TOKEN");
    if (saved === undefined) delete process.env.HUB_TOKEN; else process.env.HUB_TOKEN = saved;
  });
  it("passes only what the assistant needs to run and find its own login", () => {
    const env = assistantEnv({ PATH: "/bin", HOME: "/h", LANG: "en", HUB_TOKEN: "t", COMPOSIO_API_KEY: "k", GITHUB_TOKEN: "g", AWS_SECRET_ACCESS_KEY: "a", ANTHROPIC_API_KEY: "mine", XDG_CONFIG_HOME: "/c" });
    expect(Object.keys(env).sort()).toEqual(["ANTHROPIC_API_KEY", "HOME", "LANG", "PATH", "XDG_CONFIG_HOME"]);
  });
  it("reports an error result and a missing binary", async () => {
    process.env.FAKE_MODE = "error";
    await expect(runAssistant(base())).rejects.toThrow(/boom/);
    await expect(runAssistant(base({ claudeBin: "/nonexistent-bin" }))).rejects.toThrow(/Could not start/);
  });
  it("stops a turn that takes too long", async () => {
    await expect(runAssistant(base({ claudeBin: "/bin/sh", config: { kind: "custom", command: "/bin/sh -c 'sleep 5'" }, timeoutMs: 100 }))).rejects.toThrow(/too long/);
  });
  it("exposes the deny list for credentials and other brands", () => {
    expect(assistantDenied("/p")).toContain("Read(/p/brand/**)");
    expect(assistantDenied("/p")).toContain("Read(**/.credentials.json)");
  });
});

describe("the generic command adapter (codex and custom, tested with a fake command)", () => {
  const custom = (command: string) => base({ config: { kind: "custom", command } });
  it("sends the prompt on stdin and returns the printed text", async () => {
    const text = await runAssistant(custom(`node ${CMD}`));
    expect(JSON.parse(text).say).toContain("Heard the prompt");
  });
  it("uses the codex default command when none is typed, and says what is missing for custom", async () => {
    await expect(runAssistant(base({ config: { kind: "codex", command: "" } }))).rejects.toThrow(/Could not start codex/);
    await expect(runAssistant(custom(""))).rejects.toThrow(/No assistant command/);
  });
  it("explains a failing or silent command", async () => {
    await expect(runAssistant(custom(`node ${CMD} fail`))).rejects.toThrow(/exit code 3\. no network/);
    await expect(runAssistant(custom(`node ${CMD} empty`))).rejects.toThrow(/printed nothing/);
  });
});

describe("the interview", () => {
  const run = (config: AssistantRun["config"], claudeBin = CLAUDE) => (prompt: string) => runAssistant(base({ config, claudeBin, prompt }));
  it("asks one question at a time and tracks the summary", async () => {
    const first = await interviewTurn([], { run: run({ kind: "claude", command: "" }), takenSlugs: [] });
    expect(first).toMatchObject({ say: "Hi! What is your brand called?", done: false, draft: null });
    const second = await interviewTurn([{ role: "assistant", text: first.say }, { role: "user", text: "Acme Bakery" }], { run: run({ kind: "claude", command: "" }), takenSlugs: [] });
    expect(second.summary).toMatchObject({ name: "Acme Bakery", colors: { accent: "#d94a3d" } });
  });
  it("works through the generic command too", async () => {
    const r = await interviewTurn([{ role: "user", text: "hi" }], { run: run({ kind: "custom", command: `node ${CMD}` }), takenSlugs: [] });
    expect(r.say).toContain("Heard");
  });
  it("ends with a draft: brand.json over defaults, a free slug, no profile folder, and style.md", async () => {
    process.env.FAKE_MODE = "done";
    const r = await interviewTurn([{ role: "user", text: "that is all" }], { run: run({ kind: "claude", command: "" }), takenSlugs: ["acme-bakery"] });
    expect(r.done).toBe(true);
    expect(r.draft?.errors).toEqual([]);
    expect(r.draft?.brand).toMatchObject({ slug: "acme-bakery-2", name: "Acme Bakery", version: 1 });
    expect((r.draft?.brand.instagram as { profileDir: unknown }).profileDir).toBeNull();
    expect(r.draft?.styleMd).toContain("# Style guide: Acme Bakery");
  });
  it("carries the proposed closing keywords into the draft, empty when none came", () => {
    const rules = { product: ["menu", "qr code"], general: ["tax"] };
    expect(makeDraft({ name: "Acme Bakery" }, undefined, [], rules).closingRules).toEqual(rules);
    expect(makeDraft({ name: "Acme Bakery" }, undefined, []).closingRules).toEqual({ product: [], general: [] });
  });
  it("accepts closing keywords in a turn and asks for them in the prompt", () => {
    const t = parseTurn(JSON.stringify({ say: "ok", summary: { closingRules: { product: ["menu"] } }, closingRules: { product: ["menu"], general: ["tax"] } }));
    expect(t.ok && t.turn.closingRules).toEqual({ product: ["menu"], general: ["tax"] });
    expect(t.ok && t.turn.summary.closingRules).toEqual({ product: ["menu"], general: [] });
    expect(buildInterviewPrompt([])).toContain("closing keywords");
  });
  it("retries once when the answer is not JSON, then gives up with a clear message", async () => {
    process.env.FAKE_MODE = "retry"; process.env.FAKE_STATE = join(tmp, "state");
    expect((await interviewTurn([], { run: run({ kind: "claude", command: "" }), takenSlugs: [] })).say).toContain("brand called");
    process.env.FAKE_MODE = "prose";
    await expect(interviewTurn([], { run: run({ kind: "claude", command: "" }), takenSlugs: [] })).rejects.toThrow(/expected format/);
  });
  it("keeps invalid drafts editable with the errors listed", () => {
    const d = makeDraft({ name: "Acme", colors: { accent: "red" } }, undefined, []);
    expect(d.errors.join(" ")).toContain("colors.accent");
    expect(d.styleMd).toContain("Style guide: Acme");
    expect(makeDraft({}, "", []).brand.name).toBe("New brand");
  });
  it("builds a prompt that carries the whole conversation and the rules", () => {
    const p = buildInterviewPrompt([{ role: "assistant", text: "Name?" }, { role: "user", text: "Acme" }]);
    expect(p).toContain("Person: Acme");
    expect(p).toContain("You: Name?");
    expect(p).toContain("ONE question at a time");
    expect(buildInterviewPrompt([])).toContain("no conversation yet");
  });
  it("parses and rejects turn answers", () => {
    expect(parseTurn('```json\n{"say":"Hi"}\n```')).toMatchObject({ ok: true });
    expect(parseTurn("plain words")).toMatchObject({ ok: false });
    expect(parseTurn('{"say":""}')).toMatchObject({ ok: false });
  });
});
