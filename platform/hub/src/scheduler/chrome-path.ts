import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';

const NAMES = ['chromium', 'google-chrome-stable', 'google-chrome', 'chromium-browser'];

/**
 * The browser the Instagram flows run in: CHROME_PATH when set, else the Chromium or Google Chrome of the system (the app does not download a
 * browser of its own), else undefined, which lets Playwright use the one it downloaded (the Docker image has it).
 */
export function systemChrome(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.CHROME_PATH?.trim()) return env.CHROME_PATH.trim();
  for (const name of NAMES) {
    for (const dir of (env.PATH ?? '').split(delimiter).filter(Boolean)) {
      const f = join(dir, name);
      try { if (statSync(f).isFile()) { accessSync(f, constants.X_OK); return f; } } catch { /* not here */ }
    }
  }
  return undefined;
}
