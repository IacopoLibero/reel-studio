import { existsSync } from "node:fs";
import { delimiter } from "node:path";
import { linkSkillsForCodex } from "./ai/agent.js";
import { applyEnvLayer } from "./env.js";
import type { AssistantKind } from "./shared/types.js";
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
const sessionOf = (tool: AssistantKind): string => `reel-${tool}`;

/**
 * One terminal for the hub. With tmux, each connection attaches a pty to a named tmux session that outlives the page.
 * Without tmux, a single pty is kept alive with a replay buffer, so a reload shows the screen again.
 */
export class Terminal {
  private shared: pty.IPty | null = null;
  private sharedTool: AssistantKind | null = null;
  private buffer = "";
  private readonly useTmux: boolean;

  /** `tool` says which tool the terminal runs now (Settings > AI tool): Claude Code or Codex, in the project folder. */
  constructor(private readonly cfg: Config, private readonly tool: () => AssistantKind = () => "claude") {
    this.useTmux = !cfg.terminalCmd && hasBin("tmux");
  }

  private env(tool: AssistantKind) {
    const { HUB_TOKEN: _t, ...rest } = process.env;
    // Each tool gets its own access and Codex never an Anthropic key.
    if (tool === "codex") { const { ANTHROPIC_API_KEY: _a, ANTHROPIC_AUTH_TOKEN: _b, ...clean } = rest; return { ...applyEnvLayer(clean, "codex"), TERM: "xterm-256color" } as Record<string, string>; }
    return { ...applyEnvLayer(rest, "claude"), TERM: "xterm-256color" } as Record<string, string>;
  }

  private spawn(cols: number, rows: number, tool: AssistantKind): pty.IPty {
    const opts = { name: "xterm-256color", cols, rows, cwd: this.cfg.root, env: this.env(tool) };
    if (this.cfg.terminalCmd) return pty.spawn("/bin/sh", ["-c", this.cfg.terminalCmd], opts);
    if (tool === "codex") { try { linkSkillsForCodex(this.cfg.root); } catch { /* the terminal still starts without the links */ } }
    const bin = tool === "codex" ? this.cfg.codexBin : this.cfg.claudeBin;
    if (this.useTmux) return pty.spawn("tmux", ["new-session", "-A", "-s", sessionOf(tool), "-c", this.cfg.root, bin], opts);
    return pty.spawn(bin, [], opts);
  }

  attach(ws: WebSocket, cols = 100, rows = 30): void {
    const persistent = !this.useTmux;
    const tool = this.tool();
    let p: pty.IPty;
    try {
      if (persistent) {
        // The tool was changed in the settings: the old terminal is closed and the new tool starts.
        if (this.shared && this.sharedTool !== tool) { const old = this.shared; this.shared = null; this.buffer = ""; try { old.kill(); } catch { /* ended */ } }
        if (!this.shared) {
          const created = this.spawn(cols, rows, tool);
          created.onData((d) => { if (this.shared === created) this.buffer = (this.buffer + d).slice(-MAX_BUFFER); });
          created.onExit(() => { if (this.shared === created) { this.shared = null; this.buffer = ""; } });
          this.shared = created; this.sharedTool = tool;
        }
        p = this.shared;
        if (this.buffer) ws.send(this.buffer);
      } else p = this.spawn(cols, rows, tool);
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
