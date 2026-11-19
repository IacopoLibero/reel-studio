let tail: Promise<unknown> = Promise.resolve();

/** Runs browser flows one at a time, in call order. */
export function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.catch(() => undefined);
  return run;
}
