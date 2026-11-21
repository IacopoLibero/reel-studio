import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * The Google fonts Remotion can load (`getAvailableFonts` of @remotion/google-fonts, the list the kit's theme uses).
 * The package belongs to the Remotion project (the workspace's node_modules), not to the hub, so it is looked for there too.
 * When it is nowhere the hub cannot check names and says so instead of refusing them.
 */
export interface FontList { names: string[]; checked: boolean }

type Importer = (spec: string) => Promise<unknown>;
const PACKAGE = "@remotion/google-fonts";

let cache: FontList | null = null;

/** Imports `spec` as the project at `root` would resolve it. */
const importFrom = (root: string): Importer => async (spec) => {
  const resolved = createRequire(join(root, "package.json")).resolve(spec);
  return import(pathToFileURL(resolved).href);
};

type FontsModule = { getAvailableFonts?: () => { fontFamily: string }[]; default?: { getAvailableFonts?: () => { fontFamily: string }[] } };

/** `roots` are the Remotion projects to look in after the hub's own packages (normally the workspace). */
export async function loadFontList(importer: Importer | undefined = (s) => import(s), roots: readonly string[] = []): Promise<FontList> {
  if (cache) return cache;
  const attempts: Importer[] = [importer, ...roots.map(importFrom)];
  for (const attempt of attempts) {
    try {
      const mod = (await attempt(PACKAGE)) as FontsModule;
      const get = mod.getAvailableFonts ?? mod.default?.getAvailableFonts;
      if (!get) continue;
      cache = { names: get().map((f) => f.fontFamily).sort((a, b) => a.localeCompare(b)), checked: true };
      return cache;
    } catch { /* try the next place */ }
  }
  return { names: [], checked: false };
}

export const resetFontCache = (): void => { cache = null; };

/** Case-sensitive exact match: the kit looks the family up by this exact name. Returns the closest suggestions when it is not found. */
export function checkFont(list: FontList, name: string): { ok: boolean; suggestions: string[] } {
  if (!list.checked) return { ok: true, suggestions: [] };
  if (list.names.includes(name)) return { ok: true, suggestions: [] };
  const q = name.trim().toLowerCase();
  const near = list.names.filter((n) => q && (n.toLowerCase().includes(q) || q.includes(n.toLowerCase()))).slice(0, 5);
  return { ok: false, suggestions: near };
}
