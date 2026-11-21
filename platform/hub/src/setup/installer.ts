import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type StepState = "idle" | "running" | "done" | "failed";
export interface StepStatus { state: StepState; lines: string[]; error: string | null }
/** One install step: reports progress with `log` and throws when it fails. */
export type StepFn = (log: (line: string) => void) => Promise<void>;

const KEEP_LINES = 200;

/**
 * Runs the install steps of the setup screen one at a time per step, in the background, and remembers their progress for the screen to poll.
 * The full log of each step is written to `<data>/setup/<step>.log`.
 */
export class SetupInstaller {
  private readonly states = new Map<string, StepStatus>();

  constructor(private readonly dataDir: string, private readonly steps: Readonly<Record<string, StepFn>>) {}

  status(id: string): StepStatus {
    const s = this.states.get(id) ?? { state: "idle" as const, lines: [], error: null };
    return { ...s, lines: [...s.lines] };
  }

  /** Starts a step. Returns false when it is already running. Throws for a step that does not exist. */
  start(id: string): boolean {
    const fn = this.steps[id];
    if (!fn) throw new Error(`Unknown setup step: ${id}`);
    if (this.states.get(id)?.state === "running") return false;
    const logFile = join(this.dataDir, "setup", `${id}.log`);
    mkdirSync(join(this.dataDir, "setup"), { recursive: true });
    writeFileSync(logFile, "");
    const state: StepStatus = { state: "running", lines: [], error: null };
    this.states.set(id, state);
    const log = (line: string): void => {
      state.lines.push(line);
      if (state.lines.length > KEEP_LINES) state.lines.splice(0, state.lines.length - KEEP_LINES);
      try { appendFileSync(logFile, `${line}\n`); } catch { /* the screen still shows the line */ }
    };
    void fn(log).then(
      () => { state.state = "done"; },
      (e: unknown) => { state.state = "failed"; state.error = e instanceof Error ? e.message : String(e); },
    );
    return true;
  }
}
