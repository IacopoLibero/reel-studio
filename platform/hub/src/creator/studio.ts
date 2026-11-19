import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { checkFile } from "./files.js";

export const PREVIEW_FILE = /^[a-z0-9][a-z0-9_-]{0,40}\.png$/;

const stateSchema = z.object({
  status: z.enum(["draft", "preview", "approved"]).default("draft"),
  name: z.string().max(80).default(""),
  fields: z.object({ what: z.string().max(500).default(""), personality: z.string().max(500).default(""), extra: z.string().max(500).default("") }).default({ what: "", personality: "", extra: "" }),
  notes: z.array(z.string().max(1000)).max(50).default([]),
  builds: z.number().int().min(0).default(0),
  updatedAt: z.string().default(""),
});
export type StudioState = z.infer<typeof stateSchema>;

/** characters/<slug>/: the reference sheet, the plan, the builder script and the previews of a character made from a picture. Git-ignored. */
export const studioDir = (root: string, slug: string): string => join(root, "characters", slug);

export function readState(root: string, slug: string): StudioState {
  try { return stateSchema.parse(JSON.parse(readFileSync(join(studioDir(root, slug), "state.json"), "utf8"))); } catch { return stateSchema.parse({}); }
}

export function writeState(root: string, slug: string, state: StudioState): StudioState {
  const dir = studioDir(root, slug);
  mkdirSync(dir, { recursive: true });
  const next = stateSchema.parse({ ...state, updatedAt: new Date().toISOString() });
  writeFileSync(join(dir, "state.json.tmp"), `${JSON.stringify(next, null, 2)}\n`);
  renameSync(join(dir, "state.json.tmp"), join(dir, "state.json"));
  return next;
}

export const patchState = (root: string, slug: string, patch: Partial<StudioState>): StudioState => writeState(root, slug, { ...readState(root, slug), ...patch });

/** The reference sheet file name (png or jpg), or null. */
export function sheetFile(root: string, slug: string): string | null {
  const dir = studioDir(root, slug);
  return existsSync(dir) ? readdirSync(dir).find((f) => /^reference-sheet\.(png|jpg)$/.test(f)) ?? null : null;
}

/** Stores a reference sheet (replacing an older one of the other type). Validates the content. */
export function saveSheet(root: string, slug: string, data: Buffer): string {
  const c = checkFile("sheet", data);
  const dir = studioDir(root, slug);
  mkdirSync(dir, { recursive: true });
  for (const e of ["png", "jpg"]) rmSync(join(dir, `reference-sheet.${e}`), { force: true });
  const name = `reference-sheet.${c.ext}`;
  writeFileSync(join(dir, name), data);
  return name;
}

export function listPreviews(root: string, slug: string): string[] {
  const dir = join(studioDir(root, slug), "previews");
  return existsSync(dir) ? readdirSync(dir).filter((f) => PREVIEW_FILE.test(f)).sort() : [];
}

export function readPlan(root: string, slug: string): unknown {
  try { return JSON.parse(readFileSync(join(studioDir(root, slug), "plan.json"), "utf8")); } catch { return null; }
}
