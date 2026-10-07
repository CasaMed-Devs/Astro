import { apiClient } from '@/services/apiClient';
import { toAppError } from '@/utils/errors';

// Mirrors DELETION_REASONS in functions/src/controllers/account.controller.ts.
export type DeleteAccountReason =
  | 'no_longer_use'
  | 'unmet_expectations'
  | 'payment_issue'
  | 'privacy_concerns'
  | 'too_many_notifications'
  | 'technical_issues'
  | 'created_by_mistake'
  | 'switching_app'
  | 'other';

export interface DeleteAccountInput {
  reason: DeleteAccountReason;
  /** The user's own words — only sent when `reason` is 'other'. */
  details?: string;
}

// Longer than the default: the backend cancels the Razorpay mandate before
// it removes anything, and that call alone can take several seconds.
const DELETE_ACCOUNT_TIMEOUT_MS = 30_000;

/**
 * Permanently deletes the user's Firestore data and Firebase Auth account.
 * Must go through the backend (Admin SDK) — a client can never delete its
 * own Auth user's associated Firestore/Storage/subscription data safely.
 */
export async function deleteAccount(input: DeleteAccountInput): Promise<void> {
  try {
    await apiClient.post<void>('/account/delete', input, { timeoutMs: DELETE_ACCOUNT_TIMEOUT_MS });
  } catch (error) {
    throw toAppError(error);
  }
}
