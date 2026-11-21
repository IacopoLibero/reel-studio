import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { toolsDir } from "./checks.js";
import { runCommand } from "./run.js";
import type { SupervisorDeps } from "./voice-supervisor.js";
import type { VoiceMode } from "./voice-modes.js";

/** VoiceStudio is cloned from its official source at a pinned tag (the same one the Docker image used). */
export const VOICESTUDIO = { repo: "https://github.com/debpalash/VoiceStudio.git", ref: "v0.5.8" } as const;
export const DEFAULT_VOICE_PORT = 3900;

/** Everything VoiceStudio writes (its source, Python packages, models, settings) stays in this one folder, so removing it removes the voice. */
export const voiceHome = (dataDir: string): string => toolsDir(dataDir, "voicestudio");
export const voiceProject = (dataDir: string): string => join(voiceHome(dataDir), "project");

export interface VoiceContext { dataDir: string; port?: number }
/** `stop` resolves once the server has exited, so the port is free again. */
export interface ServerHandle { stop: () => void | Promise<void> }

/** The outside world of the install, replaceable in tests. */
export interface VoiceInstallDeps {
  run: (cmd: string, args: string[], opts: { cwd: string; env?: Record<string, string> }, log: (l: string) => void) => Promise<void>;
  startServer: (ctx: VoiceContext, mode: VoiceMode, log: (l: string) => void) => Promise<ServerHandle>;
  http: (method: "GET" | "POST", path: string, body?: unknown) => Promise<unknown>;
  downloadWeights: (ctx: VoiceContext, log: (l: string) => void) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
}

export const uvSyncArgs = (device: "gpu" | "cpu"): string[] => [
  "sync", "--frozen", "--no-dev", "--python", "3.11",
  ...(device === "cpu" ? ["--no-group", "cuda", "--group", "cpu"] : ["--group", "cuda"]),
];

/** "installed", "failed", "running <step>" or "waiting", from the answer of the engine install status request. */
export function parseEngineStatus(d: unknown): string {
  if (!d || typeof d !== "object") return "waiting";
  const r = d as { installed?: unknown; job?: { state?: unknown; steps?: { id?: unknown; state?: unknown }[] } };
  if (r.installed) return "installed";
  const state = String(r.job?.state ?? "waiting");
  if (state === "succeeded") return "installed";
  if (state === "failed") return "failed";
  const cur = r.job?.steps?.find((s) => s.state === "running")?.id;
  return cur ? `running ${String(cur)}` : state === "running" ? "running" : "waiting";
}

/** The environment VoiceStudio runs in: its own HOME inside the tools folder, so nothing leaks into the user's home. */
export function voiceEnv(ctx: VoiceContext, mode: Pick<VoiceMode, "device">): Record<string, string> {
  const home = join(voiceHome(ctx.dataDir), "home");
  return {
    HOME: home,
    UV_CACHE_DIR: join(home, ".cache", "uv"), UV_LINK_MODE: "copy", UV_HTTP_TIMEOUT: "900", UV_HTTP_RETRIES: "5", UV_CONCURRENT_DOWNLOADS: "2",
    OMNIVOICE_PORT: String(ctx.port ?? DEFAULT_VOICE_PORT),
    CUDA_VISIBLE_DEVICES: mode.device === "cpu" ? "" : (process.env.CUDA_VISIBLE_DEVICES ?? "0"),
  };
}

const NEEDS_SIDECAR_INSTALL = new Set(["voxcpm2"]);

/**
 * Installs VoiceStudio for a voice mode: source, Python packages, then (with the server running for a moment) the engine and its model,
 * and selects the engine. Safe to run again: a finished part is skipped. The server is always stopped at the end.
 */
export async function installVoiceStudio(ctx: VoiceContext, mode: VoiceMode, log: (l: string) => void, deps: VoiceInstallDeps = realDeps(ctx)): Promise<void> {
  if (!mode.engine || !mode.device) { log("No voice mode chosen: nothing to install."); return; }
  const home = voiceHome(ctx.dataDir), project = voiceProject(ctx.dataDir);
  mkdirSync(join(home, "home"), { recursive: true });
  if (!existsSync(join(project, "pyproject.toml"))) {
    log(`downloading VoiceStudio ${VOICESTUDIO.ref}`);
    const tmp = `${project}.tmp`;
    rmSync(tmp, { recursive: true, force: true });
    await deps.run("git", ["clone", "--depth", "1", "--branch", VOICESTUDIO.ref, VOICESTUDIO.repo, tmp], { cwd: home }, log);
    rmSync(project, { recursive: true, force: true });
    renameSync(tmp, project);
  }
  log(`installing the Python packages (about ${mode.device === "gpu" ? "10" : "1"} GB)`);
  await deps.run("uv", uvSyncArgs(mode.device), { cwd: project, env: voiceEnv(ctx, mode) }, log);
  log("starting VoiceStudio to install the voice engine");
  const server = await deps.startServer(ctx, mode, log);
  try {
    if (NEEDS_SIDECAR_INSTALL.has(mode.engine)) {
      await deps.http("POST", `/engines/sidecar/${mode.engine}/install`);
      let last = "";
      for (let n = 0; n < 1440; n++) {   // up to 2 hours
        const st = parseEngineStatus(await deps.http("GET", `/engines/sidecar/${mode.engine}/install/status`).catch(() => null));
        if (st !== last) { log(`engine: ${st}`); last = st; }
        if (st === "installed") break;
        if (st === "failed") throw new Error("The voice engine install failed. See the setup log for the VoiceStudio output.");
        await deps.sleep(5000);
      }
      if (last !== "installed") throw new Error("The voice engine install did not finish in two hours.");
      log("downloading the voice model (about 5 GB)");
      await deps.downloadWeights(ctx, log);
    }
    await deps.http("POST", "/engines/select", { family: "tts", backend_id: mode.engine });
    log("VoiceStudio is ready");
  } finally {
    await server.stop();
  }
}

/** Asks a child to stop and waits until it has exited (or ten seconds), so its port is free. */
export const stopChild = (child: ChildProcess): Promise<void> =>
  new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    const t = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 10_000);
    child.once("exit", () => { clearTimeout(t); resolve(); });
    child.kill("SIGTERM");
  });

/** Starts the VoiceStudio server and waits until it answers /health. */
export async function startVoiceServer(ctx: VoiceContext, mode: Pick<VoiceMode, "device">, log: (l: string) => void): Promise<ServerHandle & { child: ChildProcess }> {
  const port = ctx.port ?? DEFAULT_VOICE_PORT;
  const project = voiceProject(ctx.dataDir);
  const child = spawn(join(project, ".venv", "bin", "python"), ["-m", "uvicorn", "main:app", "--app-dir", "backend", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: project, env: { ...process.env, ...voiceEnv(ctx, mode) }, stdio: ["ignore", "pipe", "pipe"], detached: false,
  });
  child.stdout?.on("data", (d: Buffer) => d.toString().split("\n").filter(Boolean).forEach((l) => log(`[voice] ${l}`)));
  child.stderr?.on("data", (d: Buffer) => d.toString().split("\n").filter(Boolean).forEach((l) => log(`[voice] ${l}`)));
  let exited = false;
  child.on("exit", () => { exited = true; });
  for (let n = 0; n < 120 && !exited; n++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) })).ok) return { child, stop: () => stopChild(child) }; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 3000));
  }
  child.kill("SIGTERM");
  throw new Error("VoiceStudio did not start. See the setup log.");
}

function realDeps(ctx: VoiceContext): VoiceInstallDeps {
  const base = `http://127.0.0.1:${ctx.port ?? DEFAULT_VOICE_PORT}`;
  return {
    run: runCommand,
    startServer: startVoiceServer,
    http: async (method, path, body) => {
      const res = await fetch(`${base}${path}`, { method, headers: body === undefined ? {} : { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`VoiceStudio answered ${res.status} for ${method} ${path}`);
      return res.json().catch(() => ({}));
    },
    downloadWeights: async (c, log) => {
      const py = join(voiceProject(c.dataDir), ".venv", "bin", "python");
      const script = [
        "import json, pathlib", "from huggingface_hub import snapshot_download", "rev = None",
        "try:", "    for m in json.loads(pathlib.Path('backend/config/model_licenses.json').read_text()).get('models', []):",
        "        if m.get('id') == 'openbmb/VoxCPM2':", "            rev = m.get('runtime_revision') or m.get('revision')", "except Exception:", "    pass",
        "snapshot_download('openbmb/VoxCPM2', revision=rev)",
      ].join("\n");
      await runCommand(py, ["-I", "-c", script], { cwd: voiceProject(c.dataDir), env: { ...voiceEnv(c, { device: "gpu" }), HF_HUB_DISABLE_PROGRESS_BARS: "1" } }, log)
        .catch(() => log("model download failed: it will be fetched on first use"));
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}

/** The supervisor's real parts: a uvicorn child of the hub, and a health check on the VoiceStudio port. */
export function realSupervisorDeps(ctx: VoiceContext, mode: Pick<VoiceMode, "device">, log: (l: string) => void): SupervisorDeps {
  const port = ctx.port ?? DEFAULT_VOICE_PORT;
  return {
    isUp: async () => { try { return (await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; } },
    spawn: () => {
      const project = voiceProject(ctx.dataDir);
      const child = spawn(join(project, ".venv", "bin", "python"), ["-m", "uvicorn", "main:app", "--app-dir", "backend", "--host", "127.0.0.1", "--port", String(port)], {
        cwd: project, env: { ...process.env, ...voiceEnv(ctx, mode) }, stdio: ["ignore", "pipe", "pipe"],
      });
      const pipe = (d: Buffer): void => d.toString().split("\n").filter(Boolean).forEach((l) => log(`[voice] ${l}`));
      child.stdout?.on("data", pipe); child.stderr?.on("data", pipe);
      return { stop: () => child.kill("SIGTERM"), onExit: (cb) => { child.on("exit", cb); child.on("error", cb); } };
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}
