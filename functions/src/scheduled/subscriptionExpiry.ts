import { onSchedule } from 'firebase-functions/v2/scheduler';
import { Timestamp } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';
import type { SubscriptionRecord } from '../types';

/**
 * Runs daily: with real auto-recurring billing, Razorpay itself retries and
 * renews charges — this job's only job is to enforce the grace-period
 * deadline set by the subscription.halted webhook (functions/src/controllers/webhook.controller.ts).
 * If a subscription is still past_due once its grace period has elapsed
 * (meaning no subscription.charged/activated arrived to clear it), downgrade
 * to expired so the user falls back to the free credits tier.
 */
export const checkExpiredSubscriptions = onSchedule(
  { schedule: 'every 24 hours', region: 'asia-south1' },
  async () => {
    const db = adminFirestore();
    const now = Timestamp.now();

    const pastDueSubscriptions = await db
      .collection('subscriptions')
      .where('status', '==', 'past_due')
      .get();

    await Promise.all(
      pastDueSubscriptions.docs.map(async (doc) => {
        const subscription = doc.data() as SubscriptionRecord;
        const graceUntil = subscription.graceUntil;
        if (!graceUntil || graceUntil.toMillis() > now.toMillis()) return;

        await doc.ref.update({ status: 'expired' });
      }),
    );
  },
);
