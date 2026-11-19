import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export interface RunOpts {
  cmd: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdin?: string;
  signal: AbortSignal;
  onLine: (line: string, stream: "out" | "err") => void;
}

/** Runs a child process in its own group; aborting kills the whole group. Resolves with the exit code (null when killed). */
export function runProcess(o: RunOpts): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(o.cmd, o.args, { cwd: o.cwd, env: o.env, detached: true, stdio: [o.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
    const kill = () => {
      if (child.pid === undefined) return;
      try { process.kill(-child.pid, "SIGTERM"); } catch { /* already gone */ }
      setTimeout(() => { try { process.kill(-child.pid!, "SIGKILL"); } catch { /* gone */ } }, 5000).unref();
    };
    if (o.signal.aborted) kill(); else o.signal.addEventListener("abort", kill, { once: true });
    child.on("error", (e) => reject(new Error(`Could not start ${o.cmd}: ${e.message}`)));
    if (o.stdin !== undefined && child.stdin) { child.stdin.on("error", () => undefined); child.stdin.end(o.stdin); }
    createInterface({ input: child.stdout! }).on("line", (l) => o.onLine(l, "out"));
    createInterface({ input: child.stderr! }).on("line", (l) => o.onLine(l, "err"));
    child.on("close", (code) => { o.signal.removeEventListener("abort", kill); resolve(code); });
  });
}
