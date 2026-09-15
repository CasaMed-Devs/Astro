export type AppErrorCode =
  | 'network/no-connection'
  | 'auth/session-expired'
  | 'api/not-configured'
  | 'api/unauthorized'
  | 'api/timeout'
  | 'api/unknown'
  | 'credits/insufficient'
  | 'payment/failed'
  | 'payment/cancelled'
  | 'payment/verification-failed'
  | 'unknown';

export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

/**
 * The backend (functions/src/utils/errors.ts) already returns a clear,
 * user-facing `message` for every error (invalid/expired OTP, rate
 * limiting, etc.) — `apiClient`'s `mapErrorResponse` turns that into an
 * AppError carrying that message. This just normalizes anything else
 * (thrown before/outside of an API call, e.g. a network failure) into the
 * same shape so UI code never has to branch on vendor-specific error shapes.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof Error && /network/i.test(error.message)) {
    return new AppError('network/no-connection', 'Check your internet connection and try again.');
  }

  if (__DEV__) {
    console.warn('[toAppError] Unmapped error, falling back to "unknown":', error);
  }

  return new AppError('unknown', 'Something went wrong. Please try again.');
}
