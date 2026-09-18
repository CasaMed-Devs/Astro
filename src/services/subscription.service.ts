import { apiClient } from '@/services/apiClient';
import type { SubscriptionDoc } from '@/types/firestore';
import { pollFor } from '@/utils/poll';

const POLL_INTERVAL_MS = 5000;

export function subscribeToSubscription(
  callback: (subscription: SubscriptionDoc | null) => void,
): () => void {
  return pollFor(
    () => apiClient.get<SubscriptionDoc | null>('/subscriptions/me'),
    callback,
    POLL_INTERVAL_MS,
  );
}

/**
 * Mirrors the backend's grace-period rule (functions/src/services/credits.service.ts):
 * a subscriber keeps unlimited access through the 3-day grace period after a
 * failed renewal, not just while fully 'active'.
 */
export function isSubscriptionActive(subscription: SubscriptionDoc | null): boolean {
  if (!subscription) return false;
  if (subscription.status === 'active') return true;
  if (subscription.status === 'past_due') {
    return !subscription.graceUntil || new Date(subscription.graceUntil).getTime() > Date.now();
  }
  return false;
}
