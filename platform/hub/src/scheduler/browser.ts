import { chromium, type BrowserContext, type Page } from 'playwright';
import { systemChrome } from './chrome-path.js';
import { SchedulerError } from './types.js';

export const IG_URL = process.env.IG_SCHEDULE_URL ?? 'https://www.instagram.com/scheduled_content/';
export const VIEWPORT = { width: 1568, height: 727 };

let context: BrowserContext | null = null;
let contextProfile: string | null = null;

export const DEFAULT_PROFILE = process.env.CHROME_PROFILE ?? '/data/chrome-profile';

/**
 * The browser of one Instagram profile. Only one profile is open at a time (the scheduler lock already runs one browser flow
 * at a time across all brands): asking for another profile closes the current one first.
 */
export async function getContext(profileDir: string = DEFAULT_PROFILE): Promise<BrowserContext> {
  if (context) {
    try {
      context.pages(); // throws if closed
      if (contextProfile === profileDir) return context;
      await closeBrowser();
    } catch { context = null; contextProfile = null; }
  }
  const ctx = await chromium.launchPersistentContext(profileDir, {
    headless: process.env.SCHED_HEADLESS === '1',
    viewport: VIEWPORT,
    locale: 'en-US',
    timezoneId: 'Europe/Rome',
    executablePath: systemChrome(),
    env: { ...process.env, DISPLAY: process.env.DISPLAY_IG ?? process.env.DISPLAY ?? ':99' } as Record<string, string>,
    args: process.env.CHROME_NO_SANDBOX === '1' ? ['--no-sandbox'] : [],
  });
  ctx.on('close', () => { if (context === ctx) { context = null; contextProfile = null; } });
  context = ctx;
  contextProfile = profileDir;
  return ctx;
}

/** The profile of the open browser, or null when none is open. */
export const openProfile = (): string | null => (context ? contextProfile : null);

export async function closeBrowser(): Promise<void> {
  const c = context;
  context = null;
  contextProfile = null;
  await c?.close().catch(() => undefined);
}

/**
 * Logged in = the scheduled_content page shows the calendar (the "Schedule content" button)
 * and not the login form. Credentials are never typed.
 */
export async function detectLogin(page: Page, url = IG_URL): Promise<boolean> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const calendar = page.getByRole('button', { name: 'Schedule content' }).first();
  const loginForm = page.locator('input[name="username"], input[type="password"]').first();
  try {
    await Promise.race([
      calendar.waitFor({ state: 'visible', timeout: 20000 }),
      loginForm.waitFor({ state: 'visible', timeout: 20000 }),
    ]);
  } catch { return false; }
  if (await loginForm.isVisible().catch(() => false)) return false;
  return calendar.isVisible().catch(() => false);
}

export async function requireLogin(page: Page, url = IG_URL): Promise<void> {
  if (!(await detectLogin(page, url))) {
    throw new SchedulerError('login_required', 'Instagram is logged out: log in through the noVNC window');
  }
}
