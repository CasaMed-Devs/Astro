/**
 * Simple poll-based replacement for a Firestore onSnapshot listener, now
 * that the client has no Firebase Auth session to satisfy security rules
 * (all data comes from the backend's own REST API instead). Fetches
 * immediately, then again every `intervalMs`, until unsubscribed.
 */
export function pollFor<T>(
  fetchFn: () => Promise<T>,
  callback: (value: T) => void,
  intervalMs: number,
): () => void {
  let cancelled = false;
  // Ticks can overlap on a slow connection (a new one fires before the last
  // resolves). Without this, a stale response that resolves after a newer
  // one can overwrite the callback with older/shorter data. Only the
  // latest-issued tick is allowed to call back.
  let latestTick = 0;

  const tick = async () => {
    const thisTick = ++latestTick;
    try {
      const value = await fetchFn();
      if (!cancelled && thisTick === latestTick) callback(value);
    } catch {
      // Transient network errors are ignored; the next tick will retry.
    }
  };

  tick();
  const interval = setInterval(tick, intervalMs);

  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}
