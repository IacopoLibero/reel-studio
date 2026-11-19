import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

export const notificationSchema = z.object({
  id: z.string(), kind: z.enum(["daily", "test"]), brand: z.string().default(""), title: z.string().max(200), body: z.string().max(1000), url: z.string().max(200),
  createdAt: z.string(), seen: z.boolean(), seenAt: z.string().nullable(),
});
export type Notification = z.infer<typeof notificationSchema>;
const MAX_KEPT = 200;

export class NotificationStore {
  constructor(private readonly file: string) {}
  static at(dataDir: string): NotificationStore { return new NotificationStore(join(dataDir, "notifications.json")); }

  private read(): Notification[] {
    if (!existsSync(this.file)) return [];
    try { return z.array(notificationSchema).parse(JSON.parse(readFileSync(this.file, "utf8"))); } catch { return []; }
  }
  private write(all: Notification[]): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(all.slice(-MAX_KEPT), null, 2));
    renameSync(`${this.file}.tmp`, this.file);
  }

  add(n: { kind: Notification["kind"]; brand?: string; title: string; body: string; url?: string }, now = new Date()): Notification {
    const item: Notification = { id: randomUUID(), kind: n.kind, brand: n.brand ?? "", title: n.title, body: n.body, url: n.url ?? "/#/daily", createdAt: now.toISOString(), seen: false, seenAt: null };
    this.write([...this.read(), item]);
    return item;
  }
  list(unseenOnly = false): Notification[] {
    const all = this.read();
    return (unseenOnly ? all.filter((n) => !n.seen) : all).slice().reverse();
  }
  markSeen(id: string, now = new Date()): Notification | null {
    const all = this.read();
    const hit = all.find((n) => n.id === id);
    if (!hit) return null;
    const next = { ...hit, seen: true, seenAt: hit.seenAt ?? now.toISOString() };
    this.write(all.map((n) => (n.id === id ? next : n)));
    return next;
  }
}
