import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AnalyticsError } from "./errors.js";

export type ToolRunner = (slug: string, args: Record<string, unknown>) => Promise<unknown>;

/** The Composio CLI binary: COMPOSIO_BIN, else the one in ~/.composio (your own Composio login). */
export const composioBin = (env: NodeJS.ProcessEnv = process.env): string => env.COMPOSIO_BIN?.trim() || join(env.HOME ?? homedir(), ".composio", "composio");

/** Only these read-only Instagram tools may ever be run by the collector. */
export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set(["INSTAGRAM_GET_IG_USER_MEDIA", "INSTAGRAM_GET_IG_MEDIA_INSIGHTS"]);

/** The JSON object printed by `composio execute`, tolerating text around it. Never echoes the raw output. */
export function parseCliOutput(stdout: string): unknown {
  const text = stdout.trim();
  try { return JSON.parse(text); } catch { /* maybe a banner before the JSON */ }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* fall through */ }
  }
  throw new AnalyticsError("Composio printed something that is not JSON.", "runner");
}

/** Runs `composio execute <slug> -d <json>` (no shell). The credentials stay in ~/.composio and are never read here. */
export function cliRunner(bin: string = composioBin(), timeoutMs = 60_000): ToolRunner {
  return (slug, args) => new Promise((resolve, reject) => {
    if (!READ_ONLY_TOOLS.has(slug)) { reject(new AnalyticsError(`Refusing to run ${slug}: the collector is read-only.`, "runner")); return; }
    if (!existsSync(bin)) { reject(new AnalyticsError(`The Composio CLI was not found at ${bin}. Install the Composio CLI and log in with composio login.`, "runner")); return; }
    execFile(bin, ["execute", slug, "-d", JSON.stringify(args)], { timeout: timeoutMs, maxBuffer: 20_000_000, env: { ...process.env, NO_COLOR: "1" } }, (err, stdout) => {
      // A failed tool still prints its JSON on stdout (with a non-zero exit code): prefer that.
      try { resolve(parseCliOutput(stdout)); return; } catch { /* no JSON */ }
      reject(new AnalyticsError(err ? `Composio failed to run (${(err as NodeJS.ErrnoException).code ?? err.name}).` : "Composio printed nothing.", "runner"));
    });
  });
}
