import { randomBytes } from "node:crypto";

/**
 * One-time passes for the app window. The launcher asks for one with the token (a request the token already authorises), and the window
 * opens `/api/enter?n=<pass>`: the hub sets the login cookie and sends it on. So the token never appears in a command line or a URL.
 */
export class EntryNonces {
  private readonly table = new Map<string, number>();
  constructor(private readonly now: () => number = Date.now, private readonly ttlMs = 30_000) {}

  get size(): number { return this.table.size; }

  issue(): string {
    const t = this.now();
    for (const [k, exp] of this.table) if (exp <= t) this.table.delete(k);
    const nonce = randomBytes(24).toString("hex");
    this.table.set(nonce, t + this.ttlMs);
    return nonce;
  }

  /** True once for a nonce that exists and has not expired. */
  consume(nonce: string | undefined): boolean {
    if (!nonce) return false;
    const exp = this.table.get(nonce);
    this.table.delete(nonce);
    return exp !== undefined && exp > this.now();
  }
}
