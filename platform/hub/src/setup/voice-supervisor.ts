export interface Child { stop: () => void; onExit: (cb: () => void) => void }
export interface SupervisorDeps {
  /** True when something already answers on the VoiceStudio port. */
  isUp: () => Promise<boolean>;
  spawn: () => Child;
  sleep: (ms: number) => Promise<void>;
}
export type SupervisorState = "idle" | "running" | "failed" | "stopped";

/**
 * Keeps the VoiceStudio server running while the hub runs: starts it when nothing answers on its port, starts it again if it stops
 * (up to `maxRestarts` times in a row), and stops it with the hub. A server that is already running (not ours) is left alone.
 */
export class VoiceSupervisor {
  state: SupervisorState = "idle";
  private child: Child | null = null;
  private restarts = 0;

  constructor(private readonly deps: SupervisorDeps, private readonly opts: { maxRestarts: number } = { maxRestarts: 5 }) {}

  async start(): Promise<void> {
    if (this.state === "running") return;
    if (await this.deps.isUp()) return;
    this.state = "running";
    this.launch();
  }

  stop(): void {
    this.state = "stopped";
    this.child?.stop();
    this.child = null;
  }

  private launch(): void {
    const child = this.deps.spawn();
    this.child = child;
    child.onExit(() => {
      if (this.child !== child || this.state !== "running") return;
      this.child = null;
      if (this.restarts >= this.opts.maxRestarts) { this.state = "failed"; return; }
      this.restarts += 1;
      void this.deps.sleep(Math.min(30_000, 1000 * this.restarts)).then(() => { if (this.state === "running") this.launch(); });
    });
  }
}
