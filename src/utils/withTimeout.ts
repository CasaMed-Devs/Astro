import { AppError } from '@/utils/errors';

/**
 * Firestore calls have no built-in per-call timeout — a stalled
 * connection can leave a write/read promise neither resolving nor
 * rejecting for a long time, which otherwise leaves the UI stuck on a
 * loading spinner forever. Race the real call against a timer so the
 * user always sees a result within a bounded time.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new AppError('network/no-connection', message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}
