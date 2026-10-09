/**
 * Runs `fn` at most once at a time. Triggers that arrive while it runs are merged into ONE follow-up run,
 * so a burst of realtime ticks causes at most two snapshot fetches instead of one per tick.
 */
export function createCoalescer(fn: () => Promise<void>): { trigger: () => void; idle: () => Promise<void> } {
  let running: Promise<void> | null = null;
  let again = false;
  const run = (): Promise<void> => {
    running = fn()
      .catch(() => {})
      .then(() => {
        if (again) {
          again = false;
          return run();
        }
        running = null;
      });
    return running;
  };
  return {
    trigger() {
      if (running) again = true;
      else void run();
    },
    idle: () => running ?? Promise.resolve(),
  };
}
