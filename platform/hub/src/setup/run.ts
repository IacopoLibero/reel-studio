import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export interface RunOptions { cwd: string; env?: Record<string, string> }

/** Runs a program, sends every output line to `log`, and rejects with the exit code and the last lines when it fails. */
export function runCommand(cmd: string, args: string[], opts: RunOptions, log: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tail: string[] = [];
    const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdio: ["ignore", "pipe", "pipe"] });
    const feed = (stream: NodeJS.ReadableStream): void => {
      let rest = "";
      stream.on("data", (chunk: Buffer) => {
        const parts = (rest + chunk.toString()).split(/\r?\n|\r/);
        rest = parts.pop() ?? "";
        for (const l of parts.filter(Boolean)) { log(l); tail.push(l); if (tail.length > 8) tail.shift(); }
      });
      stream.on("end", () => { if (rest) { log(rest); tail.push(rest); } });
    };
    feed(child.stdout); feed(child.stderr);
    child.on("error", (e) => reject(new Error(`Could not run ${cmd}: ${e.message}`)));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} stopped with exit code ${code}.\n${tail.join("\n")}`))));
  });
}

export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}
