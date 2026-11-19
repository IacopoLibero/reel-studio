/**
 * The Google fonts Remotion can load (`getAvailableFonts` of @remotion/google-fonts, the list the kit's theme uses).
 * The package lives in the project's node_modules; when it is missing the hub cannot check names and says so instead of refusing them.
 */
export interface FontList { names: string[]; checked: boolean }

let cache: FontList | null = null;

export async function loadFontList(importer: (spec: string) => Promise<unknown> = (s) => import(s)): Promise<FontList> {
  if (cache) return cache;
  try {
    const mod = (await importer("@remotion/google-fonts")) as { getAvailableFonts: () => { fontFamily: string }[] };
    cache = { names: mod.getAvailableFonts().map((f) => f.fontFamily).sort((a, b) => a.localeCompare(b)), checked: true };
  } catch {
    return { names: [], checked: false };
  }
  return cache;
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
