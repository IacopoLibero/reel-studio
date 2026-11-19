import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { BrandRegistry } from "../brands/registry.js";
import type { Job } from "../shared/types.js";
import { studioDir } from "./studio.js";

export class DeleteError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

const stamp = (d: Date): string => d.toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");

/** Moves a folder; across devices (a Docker volume next to a bind mount) it copies and then removes. */
function move(from: string, to: string): void {
  mkdirSync(join(to, ".."), { recursive: true });
  try { renameSync(from, to); } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EXDEV") throw e;
    cpSync(from, to, { recursive: true });
    rmSync(from, { recursive: true, force: true });
  }
}

export interface TrashInput { root: string; dataDir: string; brands: BrandRegistry; slug: string; confirm: string; jobs: readonly Job[]; now?: Date }
export interface TrashResult { trash: string; moved: string[]; kept: string[] }

/**
 * "Delete brand": nothing is erased. The brand folder, reels, data folder and character folder go to <data>/trash/<slug>-<time>/.
 * Refused when the typed slug is wrong, when it is the last brand, or while a job of the brand is queued or running.
 * The Instagram browser profile is moved too when it can be done cheaply, otherwise it stays where it is and is listed in `kept`.
 */
export function trashBrand(i: TrashInput): TrashResult {
  const brand = i.brands.get(i.slug);
  if (!brand) throw new DeleteError("That brand does not exist.", 404);
  if (i.confirm !== i.slug) throw new DeleteError(`Type the slug "${i.slug}" to confirm.`, 400);
  if (i.brands.slugs().length <= 1) throw new DeleteError("This is the last brand. Create another one first: the hub needs at least one.", 409);
  const active = i.jobs.filter((j) => j.brand === i.slug && (j.status === "queued" || j.status === "running"));
  if (active.length) throw new DeleteError(`A job of this brand is still ${active[0]?.status}: "${active[0]?.title}". Wait for it or cancel it first.`, 409);

  const p = i.brands.paths(i.slug, brand);
  const trash = join(i.dataDir, "trash", `${i.slug}-${stamp(i.now ?? new Date())}`);
  const parts: [string, string][] = [[p.brandDir, "brand"], [p.reelsDir, "reels"], [studioDir(i.root, i.slug), "characters"], [p.dataDir, "data"]];
  const moved: [string, string][] = [];
  try {
    for (const [from, name] of parts) {
      if (!existsSync(from)) continue;
      move(from, join(trash, name));
      moved.push([from, join(trash, name)]);
    }
  } catch (e) {
    for (const [from, to] of moved.reverse()) { try { move(to, from); } catch { /* leave it in the trash folder */ } }
    throw new DeleteError(`Could not move the folders to the trash: ${(e as Error).message}. Nothing was deleted.`, 500);
  }
  const kept: string[] = [];
  if (existsSync(p.profileDir)) {
    try {
      if (brand.instagram.profileDir) throw new Error("own profile folder");
      renameSync(p.profileDir, join(trash, "instagram-profile"));
      moved.push([p.profileDir, join(trash, "instagram-profile")]);
    } catch { kept.push(p.profileDir); }
  }
  return { trash, moved: moved.map(([, to]) => to), kept };
}
