import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkFile, FileError, type UploadKind } from "./files.js";

export const UPLOAD_ID = /^[0-9a-f]{32}$/;
const DAY_MS = 24 * 3600 * 1000;

export interface Staged { id: string; kind: UploadKind; ext: string; size: number; path: string }

/** Files waiting for the creation job: <data>/tmp-uploads/<id>.<kind>.<ext>. The job takes what it needs and removes them; old ones are cleaned up. */
export class UploadStore {
  constructor(readonly dir: string) {}

  put(kind: UploadKind, data: Buffer): Staged {
    const c = checkFile(kind, data);
    mkdirSync(this.dir, { recursive: true });
    this.gc();
    const id = randomBytes(16).toString("hex");
    const path = join(this.dir, `${id}.${kind}.${c.ext}`);
    writeFileSync(path, data, { mode: 0o600 });
    return { id, kind, ext: c.ext, size: data.length, path };
  }

  /** The staged file of that id and kind, or null. Ids are random hex: nothing else is ever joined into a path. */
  get(id: string, kind: UploadKind): Staged | null {
    if (!UPLOAD_ID.test(id) || !existsSync(this.dir)) return null;
    const name = readdirSync(this.dir).find((f) => f.startsWith(`${id}.${kind}.`));
    if (!name) return null;
    const path = join(this.dir, name);
    return { id, kind, ext: name.split(".").pop() ?? "", size: statSync(path).size, path };
  }

  read(id: string, kind: UploadKind): { staged: Staged; data: Buffer } {
    const staged = this.get(id, kind);
    if (!staged) throw new FileError(`The uploaded ${kind} file is gone. Upload it again.`);
    return { staged, data: readFileSync(staged.path) };
  }

  remove(id: string): void {
    if (!UPLOAD_ID.test(id) || !existsSync(this.dir)) return;
    for (const f of readdirSync(this.dir)) if (f.startsWith(`${id}.`)) rmSync(join(this.dir, f), { recursive: true, force: true });
  }

  gc(maxAgeMs = DAY_MS, now = Date.now()): void {
    if (!existsSync(this.dir)) return;
    for (const f of readdirSync(this.dir)) {
      const p = join(this.dir, f);
      try { if (now - statSync(p).mtimeMs > maxAgeMs) rmSync(p, { recursive: true, force: true }); } catch { /* gone already */ }
    }
  }
}
