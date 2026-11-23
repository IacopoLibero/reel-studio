/**
 * The files the program ships into the workspace (the Remotion project the reels are rendered from).
 * The library of Ootto skills (`platform/skills`) is NOT copied: `.claude/skills/ootto-<name>` links to the program's own folder when a skill is switched on (those links are the user's choice, kept pointing at the program by syncProgram).
 * The common sounds (`sfx/`) and the Ootto skills are read from the program, not copied. Everything else in the workspace belongs to the user: brand/ (each brand's identity, character and reels), the reels' own code in src/, and so on. The brand template (brand/_template) is read from the program folder and is not copied.
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
  ".claude/skills/carousel",
  ".claude/skills/reel-hooks",
  ".claude/skills/reel-insights",
  ".claude/skills/reel-research",
  ".claude/skills/reel-threads",
];

/** Tracked files of the repository that are not part of the workspace (the hub, the desktop app, the package, documentation, CI). */
export const REPO_ONLY_PREFIXES: readonly string[] = [
  "platform/", "packaging/", "docs/", ".github/", "brand/_template/", "sfx/", ".gitignore", ".gitattributes", ".editorconfig", ".prettierrc", ".env.example",
  "eslint.config.mjs",
  "README.md", "CHANGELOG.md", "LICENSE", "SECURITY.md", "CODE_OF_CONDUCT.md", "CONTRIBUTING.md", "THIRD_PARTY_NOTICES.md", "TODO.md",
];

/** True when a path (relative to the project) is one of the program's own files. */
export function isProgramPath(rel: string, entries: readonly string[] = PROGRAM_ENTRIES): boolean {
  return entries.some((e) => rel === e || rel.startsWith(`${e}/`));
}
