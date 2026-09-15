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

export function isSubscriptionActive(subscription: SubscriptionDoc | null): boolean {
  return subscription?.status === 'active';
}
