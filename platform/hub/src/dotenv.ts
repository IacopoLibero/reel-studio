import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultRoot } from "./paths.js";

/**
 * Settings the hub may read from the project's .env when the process environment does not set them.
 * The token and every other secret are deliberately not on this list: the hub gets those from its environment only.
 * (The container is normally started with these already set by docker-compose; this makes a plain hub restart enough
 * after editing .env, and lets the hub run outside Docker.)
 */
const READABLE: Readonly<Record<string, string>> = {
  BRAND: "BRAND",
  IG_USER_ID: "IG_USER_ID",
  IG_ACCOUNT: "IG_ACCOUNT",
  BLOG_DIR: "HUB_BLOG_DIR",
  OFFER_LAST_DAY: "OFFER_LAST_DAY",
  OFFER_REGEX: "OFFER_REGEX",
};

/** Parses KEY=VALUE lines: skips comments and blanks, drops an inline " # comment" and surrounding quotes. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Z0-9_]*)=(.*)$/.exec(raw);
    if (!m) continue;
    let v = (m[2] as string).trim();
    const q = /^(["'])(.*?)\1/.exec(v);
    v = q ? (q[2] as string) : v.replace(/\s+#.*$/, "").trim();
    out[m[1] as string] = v;
  }
  return out;
}

/** Fills READABLE settings that are unset or empty in `env` from <root>/.env. Returns the names it set. */
export function applyProjectEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const file = join(defaultRoot(env), ".env");
  if (!existsSync(file)) return [];
  const values = parseEnvFile(readFileSync(file, "utf8"));
  const set: string[] = [];
  for (const [key, target] of Object.entries(READABLE)) {
    const v = values[key];
    if (v && !env[target]?.trim()) { env[target] = v; set.push(target); }
  }
  return set;
}
