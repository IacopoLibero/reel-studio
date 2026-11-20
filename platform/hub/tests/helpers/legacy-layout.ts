import { put } from "./tree.js";

/** A small copy of the old single-folder layout: program files, the author's files, caches, hub data and an Instagram login. */
export function buildLegacy({ legacy, legacyData, chrome }: { legacy: string; legacyData: string; chrome: string }): void {
  // program files (stay in the program, are not copied)
  put(legacy, "src/kit/theme.ts"); put(legacy, "src/Root.tsx"); put(legacy, "src/Composition.tsx"); put(legacy, "src/index.ts"); put(legacy, "src/cover/Cover.tsx");
  put(legacy, "scripts/voice.mjs"); put(legacy, "brand/_template/brand.json", "{}");
  put(legacy, ".claude/skills/reel/SKILL.md"); put(legacy, "public/a1/ding.wav");
  // the author's own files (copied)
  put(legacy, "src/r1/R1.tsx", "reel 1"); put(legacy, "src/Root.private.tsx", "private root");
  put(legacy, "brand/acme/brand.json", JSON.stringify({ slug: "acme", instagram: { account: "acme", userId: "1", profileDir: chrome } }));
  put(legacy, "brand/acme/style.md", "# style");
  put(legacy, "reels/acme/1-x/x.mp4", "video bytes"); put(legacy, "reels/acme/1-x/caption.md", "caption");
  put(legacy, "mascot/m.py", "blender"); put(legacy, "public/mascot/idle/0.png", "png"); put(legacy, "public/a1/friendly.wav", "wav");
  put(legacy, ".claude/skills/ootto-hook-mining/SKILL.md"); put(legacy, ".claude/skills/remotion-best-practices/SKILL.md"); put(legacy, ".agents/skills/x/SKILL.md");
  put(legacy, ".claude/settings.local.json", "{}"); put(legacy, "skills-lock.json", "{}");
  // caches (never copied)
  put(legacy, "node_modules/pkg/index.js"); put(legacy, "whisper.cpp/main"); put(legacy, "out/video.mp4");
  // hub data
  put(legacyData, "settings.json", "{\"a\":1}"); put(legacyData, "jobs.json", "[]"); put(legacyData, "tmp-uploads/u.bin");
  put(legacyData, "brands/acme/settings.json", "{}"); put(legacyData, "brands/acme/scheduled.json", "{\"acme/1-x\":{\"slot\":\"2026-11-21T07:30\"}}");
  put(legacyData, "brands/acme/analytics/2026-11-20.json", "{}");
  // Instagram login of the brand
  put(chrome, "Default/Cookies", "cookie jar"); put(chrome, "Local State", "{}"); put(chrome, "SingletonLock", "lock"); put(chrome, "SingletonSocket", "sock");
}
