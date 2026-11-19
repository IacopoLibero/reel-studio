import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 90000,
    coverage: {
      provider: 'v8',
      include: ['slots.ts', 'caption.ts', 'state.ts', 'calendar.ts', 'lock.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
