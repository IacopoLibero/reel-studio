import { existsSync } from "node:fs";
import { delimiter } from "node:path";
import * as pty from "node-pty";
import type { WebSocket } from "ws";
import { z } from "zod";
import type { Config } from "./config.js";

const MAX_BUFFER = 200_000;
const msgSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("input"), data: z.string().max(100_000) }),
  z.object({ type: z.literal("resize"), cols: z.number().int().min(10).max(500), rows: z.number().int().min(3).max(200) }),
]);

const hasBin = (b: string) => (process.env.PATH ?? "").split(delimiter).some((d) => d && existsSync(`${d}/${b}`));
const SESSION = "reel-claude";

/**
 * One terminal for the hub. With tmux, each connection attaches a pty to a named tmux session that outlives the page.
 * Without tmux, a single pty is kept alive with a replay buffer, so a reload shows the screen again.
 */
export class Terminal {
  private shared: pty.IPty | null = null;
  private buffer = "";
  private readonly useTmux: boolean;

  constructor(private readonly cfg: Config) {
    this.useTmux = !cfg.terminalCmd && hasBin("tmux");
  }

  private env() {
    const { HUB_TOKEN: _t, ...rest } = process.env;
    return { ...rest, TERM: "xterm-256color" } as Record<string, string>;
  }

  private spawn(cols: number, rows: number): pty.IPty {
    const opts = { name: "xterm-256color", cols, rows, cwd: this.cfg.root, env: this.env() };
    if (this.cfg.terminalCmd) return pty.spawn("/bin/sh", ["-c", this.cfg.terminalCmd], opts);
    if (this.useTmux) return pty.spawn("tmux", ["new-session", "-A", "-s", SESSION, "-c", this.cfg.root, this.cfg.claudeBin], opts);
    return pty.spawn(this.cfg.claudeBin, [], opts);
  }

  attach(ws: WebSocket, cols = 100, rows = 30): void {
    const persistent = !this.useTmux;
    let p: pty.IPty;
    try {
      if (persistent) {
        if (!this.shared) {
          const created = this.spawn(cols, rows);
          created.onData((d) => { this.buffer = (this.buffer + d).slice(-MAX_BUFFER); });
          created.onExit(() => { this.shared = null; this.buffer = ""; });
          this.shared = created;
        }
        p = this.shared;
        if (this.buffer) ws.send(this.buffer);
      } else p = this.spawn(cols, rows);
    } catch (e) {
      ws.send(`\r\nCould not start the terminal: ${(e as Error).message}\r\n`);
      ws.close();
      return;
    }
    const sub = p.onData((d) => { if (ws.readyState === ws.OPEN) ws.send(d); });
    const exitSub = p.onExit(({ exitCode }) => { if (ws.readyState === ws.OPEN) { ws.send(`\r\n[session ended, code ${exitCode}. Reload to start a new one]\r\n`); ws.close(); } });
    ws.on("message", (raw) => {
      let msg: z.infer<typeof msgSchema>;
      try { msg = msgSchema.parse(JSON.parse(raw.toString())); } catch { return; }
      if (msg.type === "input") p.write(msg.data); else { try { p.resize(msg.cols, msg.rows); } catch { /* ended */ } }
    });
    ws.on("close", () => { sub.dispose(); exitSub.dispose(); if (!persistent) p.kill(); });
  }
}
