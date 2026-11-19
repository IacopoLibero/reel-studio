import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/jobs/store.ts", "src/slots.ts", "src/reels/scanner.ts", "src/buddy/moves-parser.ts", "src/buddy/claude-stream.ts", "src/factory/questions.ts", "src/factory/classifier.ts", "src/factory/allocator.ts", "src/factory/make-prompt.ts", "src/factory/make-stream.ts", "src/shared/calendar-grid.ts", "src/calendar/merge.ts", "src/calendar/schemas.ts", "src/calendar/jobs.ts", "src/calendar/state.ts", "src/skills/ootto.ts", "src/routes/skills.ts", "src/ideas/schema.ts", "src/ideas/dedupe.ts", "src/ideas/append.ts", "src/ideas/prompt.ts", "src/ideas/store.ts", "src/ideas/service.ts", "src/ideas/handler.ts", "src/routes/ideas.ts", "src/analytics/*.ts", "src/series/*.ts", "src/calendar/best-times.ts", "src/brands/*.ts", "src/settings.ts", "src/daily/loops.ts", "src/routes/scope.ts", "src/routes/brands.ts", "src/routes/content.ts", "src/calendar/cache.ts", "src/env.ts", "src/character/*.ts", "src/creator/*.ts", "src/routes/creator.ts", "src/routes/studio.ts", "src/shared/contrast.ts", "src/shared/character-prompt.ts", "web/creator/draft.ts", "web/creator/extras.ts"],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 },
    },
  },
});
