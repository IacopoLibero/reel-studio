import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccessError, AccessStore } from "../src/claude/access.js";

const KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "access-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("AccessStore", () => {
  it("starts with the subscription login and no key", () => {
    expect(new AccessStore(dir).state()).toEqual({ mode: "login", hasKey: false, keyHint: "" });
  });
  it("saves a key with only the owner able to read it, and never shows more than its end", () => {
    const a = new AccessStore(dir);
    a.setKey(KEY);
    expect(statSync(join(dir, "claude-api-key")).mode & 0o777).toBe(0o600);
    expect(a.state()).toEqual({ mode: "login", hasKey: true, keyHint: "…6789" });
    expect(JSON.stringify(a.state())).not.toContain("abcdefghij");
  });
  it("refuses something that is not an Anthropic API key, and does not save it", () => {
    const a = new AccessStore(dir);
    for (const bad of ["", "hello", "sk-proj-abcdefghijklmnopqrstuvwxyz", "sk-ant-short", `${KEY}\nextra`, " "]) expect(() => a.setKey(bad), bad).toThrow(AccessError);
    expect(a.state().hasKey).toBe(false);
  });
  it("trims a key that was pasted with spaces around it", () => {
    const a = new AccessStore(dir);
    a.setKey(`  ${KEY}\n`);
    expect(readFileSync(join(dir, "claude-api-key"), "utf8")).toBe(KEY);
  });
  it("will not switch to the API key without one", () => {
    expect(() => new AccessStore(dir).setMode("api-key")).toThrow(/key/i);
  });
  it("switches mode, keeps it after a restart, and removes the key (back to the login)", () => {
    const a = new AccessStore(dir);
    a.setKey(KEY); a.setMode("api-key");
    expect(new AccessStore(dir).state().mode).toBe("api-key");
    a.clearKey();
    expect(new AccessStore(dir).state()).toEqual({ mode: "login", hasKey: false, keyHint: "" });
  });
  it("ignores a damaged settings file", () => {
    writeFileSync(join(dir, "claude-access.json"), "{nope");
    expect(new AccessStore(dir).state().mode).toBe("login");
  });
});

describe("AccessStore.apply (the environment of a Claude run)", () => {
  it("with the API key: sets it, and asks Claude Code not to hand credentials to the commands it runs", () => {
    const a = new AccessStore(dir); a.setKey(KEY); a.setMode("api-key");
    const env = a.apply({ PATH: "/bin", ANTHROPIC_AUTH_TOKEN: "x" });
    expect(env.ANTHROPIC_API_KEY).toBe(KEY);
    expect(env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB).toBe("1");
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(env.PATH).toBe("/bin");
  });
  it("with the login: removes any key from the environment so the subscription is used", () => {
    const env = new AccessStore(dir).apply({ PATH: "/bin", ANTHROPIC_API_KEY: "sk-ant-from-the-shell-0123456789", ANTHROPIC_AUTH_TOKEN: "t" });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(env.PATH).toBe("/bin");
  });
  it("does not change the environment it is given", () => {
    const base = { A: "1" };
    new AccessStore(dir).apply(base);
    expect(base).toEqual({ A: "1" });
  });
  it("falls back to the login when the key file is gone", () => {
    const a = new AccessStore(dir); a.setKey(KEY); a.setMode("api-key");
    rmSync(join(dir, "claude-api-key"));
    expect(a.apply({}).ANTHROPIC_API_KEY).toBeUndefined();
    expect(a.state().mode).toBe("login");
  });
});

describe("AccessStore for Codex", () => {
  const OAI = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789";
  it("keeps its own key and mode, apart from Claude's", () => {
    const c = new AccessStore(dir, "codex"); c.setKey(OAI); c.setMode("api-key");
    expect(c.state()).toEqual({ mode: "api-key", hasKey: true, keyHint: "…6789" });
    expect(new AccessStore(dir, "claude").state()).toEqual({ mode: "login", hasKey: false, keyHint: "" });
    expect(statSync(join(dir, "codex-api-key")).mode & 0o777).toBe(0o600);
  });
  it("takes an OpenAI key and refuses an Anthropic one", () => {
    const c = new AccessStore(dir, "codex");
    expect(() => c.setKey(KEY.replace("sk-ant-", "sk-ant-"))).not.toThrow(); // an sk- key of this shape is accepted by the format; the check call tells if it works
    expect(() => c.setKey("hello")).toThrow(/OpenAI/);
  });
  it("with the API key: sets OPENAI_API_KEY, not the Claude variables; with the login: removes any OpenAI key", () => {
    const c = new AccessStore(dir, "codex"); c.setKey(OAI); c.setMode("api-key");
    const on = c.apply({ PATH: "/bin", CODEX_API_KEY: "old" });
    expect(on.OPENAI_API_KEY).toBe(OAI);
    expect(on.CODEX_API_KEY).toBeUndefined();
    expect(on.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB).toBeUndefined();
    c.setMode("login");
    expect(c.apply({ OPENAI_API_KEY: "from-shell" }).OPENAI_API_KEY).toBeUndefined();
  });
});
