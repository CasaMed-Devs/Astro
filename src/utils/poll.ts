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

  const tick = async () => {
    try {
      const value = await fetchFn();
      if (!cancelled) callback(value);
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
