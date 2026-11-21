"use strict";
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawn } = require("node:child_process");

/** The PATH of the hub: what the app got, plus the folders where Claude Code and the GPU tools usually are (a desktop launcher has a short PATH). */
function augmentPath(current, home) {
  const have = new Set(current.split(":").filter(Boolean));
  const extra = [`${home}/.local/bin`, `${home}/.npm-global/bin`, "/usr/local/bin", "/usr/bin", "/opt/cuda/bin"].filter((d) => !have.has(d));
  return [...have, ...extra].join(":");
}

/** Waits until GET <base>/api/health answers. */
async function waitHealth(base, { timeoutMs = 60000, intervalMs = 500, fetch: f = fetch } = {}) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    try { if ((await f(`${base}/api/health`)).ok) return true; } catch { /* not up yet */ }
    if (Date.now() >= end) return false;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** The token the hub made the first time (data/dev-token), or null. */
function readToken(dataDir) {
  const f = join(dataDir, "dev-token");
  return existsSync(f) ? readFileSync(f, "utf8").trim() || null : null;
}

/** The address the window opens: it signs in with a one-time pass, so the token is never in an address. */
async function enterUrl(base, token, f = fetch) {
  const r = await f(`${base}/api/enter-nonce`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`The hub refused the sign-in (${r.status}).`);
  const { nonce } = await r.json();
  return `${base}/api/enter?n=${nonce}`;
}

/** Starts the hub with the system Node. The caller stops it with the returned `stop`. */
function startHub({ node = "node", hubDir, env, onLine = () => {} }) {
  const child = spawn(node, ["dist/index.js"], { cwd: hubDir, env, stdio: ["ignore", "pipe", "pipe"] });
  const feed = (d) => d.toString().split("\n").filter(Boolean).forEach(onLine);
  child.stdout.on("data", feed); child.stderr.on("data", feed);
  const exited = new Promise((resolve) => child.once("exit", (code) => resolve(code)));
  const stop = () => new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    const t = setTimeout(() => child.kill("SIGKILL"), 10000);
    child.once("exit", () => { clearTimeout(t); resolve(); });
    child.kill("SIGTERM");
  });
  return { child, exited, stop };
}

module.exports = { augmentPath, waitHealth, readToken, enterUrl, startHub };
