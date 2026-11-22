import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { defaultDataDir, defaultRoot } from "./paths.js";

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  root: string;
  token: string;
  webDir: string;
  claudeBin: string;
  blogDir: string;
  terminalCmd: string | null;
}

const HERE = import.meta.dirname;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = defaultDataDir(env);
  mkdirSync(dataDir, { recursive: true });
  let token = env.HUB_TOKEN?.trim() ?? "";
  if (!token) {
    const f = join(dataDir, "dev-token");
    if (!existsSync(f)) writeFileSync(f, randomBytes(24).toString("hex"), { mode: 0o600 });
    token = readFileSync(f, "utf8").trim();
    console.log(`HUB_TOKEN not set: using the development token stored in ${f}`);
  }
  const webDir = [env.HUB_WEB_DIR?.trim(), join(HERE, "web"), join(HERE, "../dist/web")].filter((d): d is string => !!d).find((d) => existsSync(join(d, "index.html"))) ?? join(HERE, "web");
  const root = defaultRoot(env);
  return {
    port: Number(env.HUB_PORT ?? 4000),
    host: env.HUB_HOST ?? "127.0.0.1",
    dataDir,
    root,
    token,
    webDir,
    claudeBin: env.HUB_CLAUDE_BIN ?? "claude",
    // Optional folder of source texts (blog posts) the ideas jobs read. Default: sources/blog inside the project.
    blogDir: env.HUB_BLOG_DIR?.trim() || join(root, "sources", "blog"),
    terminalCmd: env.HUB_TERMINAL_CMD ?? null,
  };
}

export const dataFile = (c: Config, name: string) => join(c.dataDir, name);
export const ensureDir = (file: string) => mkdirSync(dirname(file), { recursive: true });
