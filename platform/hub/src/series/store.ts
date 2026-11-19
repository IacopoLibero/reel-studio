import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { seriesFile, type Series, type SeriesInput } from "./schema.js";

/** data/series.json. Series objects are never mutated: every change writes a new list. */
export class SeriesStore {
  constructor(private readonly file: string) {}

  list(): Series[] {
    if (!existsSync(this.file)) return [];
    try {
      const r = seriesFile.safeParse(JSON.parse(readFileSync(this.file, "utf8")));
      return r.success ? r.data.series : [];
    } catch { return []; }
  }

  private save(series: Series[]): Series[] {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ series }, null, 2));
    renameSync(tmp, this.file);
    return series;
  }

  get(id: string): Series | null { return this.list().find((s) => s.id === id) ?? null; }

  /** A question belongs to at most one series: assigning it here takes it away from the others. */
  private withExclusive(all: readonly Series[], keep: string, ids: readonly string[]): Series[] {
    return all.map((s) => (s.id === keep ? s : { ...s, questionIds: s.questionIds.filter((q) => !ids.includes(q)) }));
  }

  create(input: SeriesInput, now: Date = new Date()): Series {
    const s: Series = { ...input, questionIds: [...new Set(input.questionIds)], id: randomBytes(6).toString("hex"), createdAt: now.toISOString() };
    this.save([...this.withExclusive(this.list(), s.id, s.questionIds), s]);
    return s;
  }

  update(id: string, input: SeriesInput): Series | null {
    const all = this.list();
    const old = all.find((s) => s.id === id);
    if (!old) return null;
    const next: Series = { ...old, ...input, questionIds: [...new Set(input.questionIds)] };
    this.save(this.withExclusive(all, id, next.questionIds).map((s) => (s.id === id ? next : s)));
    return next;
  }

  assign(id: string, questionIds: readonly string[]): Series | null {
    const old = this.get(id);
    return old ? this.update(id, { ...old, questionIds: [...questionIds] }) : null;
  }

  remove(id: string): boolean {
    const all = this.list();
    if (!all.some((s) => s.id === id)) return false;
    this.save(all.filter((s) => s.id !== id));
    return true;
  }

  /** question id to the series that holds it, for the badge in the Factory. */
  badges(): Record<string, { id: string; name: string }> {
    const out: Record<string, { id: string; name: string }> = {};
    for (const s of this.list()) for (const q of s.questionIds) out[q] = { id: s.id, name: s.name };
    return out;
  }
}
