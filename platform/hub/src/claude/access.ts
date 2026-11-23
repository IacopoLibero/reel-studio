import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Provider = "claude" | "codex";
export const PROVIDERS: readonly Provider[] = ["claude", "codex"];
export type AccessMode = "login" | "api-key";
export interface AccessState { mode: AccessMode; hasKey: boolean; /** The last four characters, to recognise the key. Never the whole key. */ keyHint: string }
export class AccessError extends Error {}

interface Spec {
  keyFormat: RegExp;
  keyHelp: string;
  /** The variable that carries the key. */
  keyVar: string;
  /** Every variable that would make the tool use something other than the chosen access. */
  credentialVars: readonly string[];
  /** Set only in the API-key mode. */
  extraEnv: Readonly<Record<string, string>>;
}

const SPECS: Readonly<Record<Provider, Spec>> = {
  claude: {
    keyFormat: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
    keyHelp: "That is not an Anthropic API key. It starts with sk-ant- (create one in the Anthropic Console).",
    keyVar: "ANTHROPIC_API_KEY",
    credentialVars: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"],
    // Keeps Claude Code from handing credentials on to the commands it runs.
    extraEnv: { CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "1" },
  },
  codex: {
    keyFormat: /^sk-[A-Za-z0-9_-]{20,}$/,
    keyHelp: "That is not an OpenAI API key. It starts with sk- (create one in the OpenAI dashboard).",
    keyVar: "OPENAI_API_KEY",
    credentialVars: ["OPENAI_API_KEY", "CODEX_API_KEY"],
    extraEnv: {},
  },
};

/**
 * How the hub's Claude or Codex runs sign in: with the login of the tool itself (`claude`, `codex login`: your subscription, the default) or with an API key (pay per use).
 * A key is kept in its own file, readable only by the user, and is never part of the settings the web app reads.
 */
export class AccessStore {
  private readonly spec: Spec;
  constructor(private readonly dir: string, readonly provider: Provider = "claude") { this.spec = SPECS[provider]; }

  private get keyFile(): string { return join(this.dir, `${this.provider}-api-key`); }
  private get modeFile(): string { return join(this.dir, `${this.provider}-access.json`); }

  private key(): string | null {
    try { const k = readFileSync(this.keyFile, "utf8").trim(); return this.spec.keyFormat.test(k) ? k : null; } catch { return null; }
  }

  private savedMode(): AccessMode {
    try { return (JSON.parse(readFileSync(this.modeFile, "utf8")) as { mode?: unknown }).mode === "api-key" ? "api-key" : "login"; } catch { return "login"; }
  }

  state(): AccessState {
    const k = this.key();
    return { mode: k && this.savedMode() === "api-key" ? "api-key" : "login", hasKey: !!k, keyHint: k ? `…${k.slice(-4)}` : "" };
  }

  setKey(raw: string): void {
    const k = raw.trim();
    if (!this.spec.keyFormat.test(k)) throw new AccessError(this.spec.keyHelp);
    mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.keyFile}.tmp`;
    writeFileSync(tmp, k, { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, this.keyFile);
  }

  setMode(mode: AccessMode): void {
    if (mode === "api-key" && !this.key()) throw new AccessError("Save an API key first.");
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.modeFile, `${JSON.stringify({ mode })}\n`);
  }

  /** Removes the key, and with it the API-key mode. */
  clearKey(): void {
    rmSync(this.keyFile, { force: true });
    if (existsSync(this.modeFile)) writeFileSync(this.modeFile, `${JSON.stringify({ mode: "login" })}\n`);
  }

  /**
   * The environment for a run of the tool: with the API key mode the key (and, for Claude, the switch that keeps it from passing credentials on to the commands it runs);
   * with the login, no key at all, even if the shell that started the app has one. Returns a new object.
   */
  apply(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const env = { ...base };
    for (const v of this.spec.credentialVars) delete env[v];
    const k = this.state().mode === "api-key" ? this.key() : null;
    if (k) Object.assign(env, { [this.spec.keyVar]: k }, this.spec.extraEnv);
    return env;
  }
}
