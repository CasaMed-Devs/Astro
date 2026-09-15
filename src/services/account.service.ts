import { apiClient } from '@/services/apiClient';

/**
 * Permanently deletes the user's Firestore data and Firebase Auth account.
 * Must go through the backend (Admin SDK) — a client can never delete its
 * own Auth user's associated Firestore/Storage/subscription data safely.
 */
export function deleteAccount(): Promise<void> {
  return apiClient.post<void>('/account/delete');
}
