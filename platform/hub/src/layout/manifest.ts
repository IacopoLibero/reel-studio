/**
 * The files the program ships into the workspace (the Remotion project the reels are rendered from).
 * `platform/skills` is the library of Ootto skills; `.claude/skills/ootto-<name>` links to it when a skill is switched on (those links are the user's choice).
 * Everything else in the workspace belongs to the user: brand/, reels/, mascot/, public/, the reels' own code in src/, and so on.
 * Paths are relative to the program folder; a folder entry stands for every file inside it.
 */
export const PROGRAM_ENTRIES: readonly string[] = [
  "src/kit",
  "src/cover",
  "src/Root.tsx",
  "src/Composition.tsx",
  "src/index.ts",
  "remotion.config.ts",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "scripts",
  ".claude/skills/reel",
  ".claude/skills/reel-hooks",
  ".claude/skills/reel-insights",
  ".claude/skills/reel-research",
  ".claude/skills/reel-threads",
  "brand/_template",
  "platform/skills",
  "public/a1/ding.wav",
  "public/a1/pop.wav",
  "public/a1/slash.wav",
  "public/a1/tick.wav",
];

/** Tracked files of the repository that are not part of the workspace (the hub, Docker files, documentation, CI). */
export const REPO_ONLY_PREFIXES: readonly string[] = [
  "platform/", "docs/", ".github/", ".gitignore", ".gitattributes", ".dockerignore", ".editorconfig", ".prettierrc", ".env.example",
  "eslint.config.mjs", "install.sh", "update.sh", "uninstall.sh",
  "README.md", "LICENSE", "SECURITY.md", "CODE_OF_CONDUCT.md", "CONTRIBUTING.md", "THIRD_PARTY_NOTICES.md", "TODO.md",
];

/** True when a path (relative to the project) is one of the program's own files. */
export function isProgramPath(rel: string, entries: readonly string[] = PROGRAM_ENTRIES): boolean {
  return entries.some((e) => rel === e || rel.startsWith(`${e}/`));
}
