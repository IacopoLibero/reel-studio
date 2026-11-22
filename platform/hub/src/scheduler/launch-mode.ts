export interface ContextOptions {
  /** A window is needed (the login window, a schedule flow). Reads (status, calendar) leave this out: they run without a window. */
  visible?: boolean;
  /** With `visible`: start minimized, for a flow that works by itself and needs no attention. */
  minimized?: boolean;
}

export interface LaunchMode { headless: boolean; args: string[] }

/**
 * How the Instagram browser starts. On a desktop a read must not open a window every time the Calendar page is looked at, so it runs headless.
 * In Docker the browser has always run on a virtual screen nobody sees, so it stays a window there (Instagram is more at ease with it).
 */
export function launchMode(opts: ContextOptions = {}, env: NodeJS.ProcessEnv = process.env, inDocker = false): LaunchMode {
  const headless = env.SCHED_HEADLESS === '1' || (!inDocker && !opts.visible);
  const args: string[] = [];
  if (env.CHROME_NO_SANDBOX === '1') args.push('--no-sandbox');
  if (!headless && opts.visible && opts.minimized) args.push('--start-minimized');
  return { headless, args };
}

/** An open browser can serve a request when it is of the same profile and shows a window if one is needed. */
export function canReuse(open: { profile: string; visible: boolean }, profile: string, needsWindow: boolean): boolean {
  return open.profile === profile && (open.visible || !needsWindow);
}
