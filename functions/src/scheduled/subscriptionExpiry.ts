import { onSchedule } from 'firebase-functions/v2/scheduler';
import { Timestamp } from 'firebase-admin/firestore';

import { adminFirestore, adminMessaging } from '../config/firebase-admin';
import type { SubscriptionRecord, UserProfileRecord } from '../types';

const REMINDER_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3 days before expiry

/**
 * Runs daily: expires subscriptions past their period end, and sends a
 * renewal-reminder push to users expiring within the next 3 days.
 */
export const checkExpiredSubscriptions = onSchedule(
  { schedule: 'every 24 hours', region: 'asia-south1' },
  async () => {
    const db = adminFirestore();
    const now = Timestamp.now();
    const reminderCutoff = Timestamp.fromMillis(now.toMillis() + REMINDER_WINDOW_MS);

    const activeSubscriptions = await db
      .collection('subscriptions')
      .where('status', '==', 'active')
      .get();

    await Promise.all(
      activeSubscriptions.docs.map(async (doc) => {
        const subscription = doc.data() as SubscriptionRecord;
        const periodEnd = subscription.currentPeriodEnd;
        if (!periodEnd) return;

        if (periodEnd.toMillis() <= now.toMillis()) {
          await doc.ref.update({ status: 'expired' });
          return;
        }

        if (periodEnd.toMillis() <= reminderCutoff.toMillis()) {
          await sendRenewalReminder(doc.id);
        }
      }),
    );
  },
);

async function sendRenewalReminder(uid: string): Promise<void> {
  const userSnapshot = await adminFirestore().collection('users').doc(uid).get();
  if (!userSnapshot.exists) return;

  const user = userSnapshot.data() as UserProfileRecord & { fcmTokens?: string[] };
  const tokens = user.fcmTokens ?? [];
  if (tokens.length === 0) return;

  await adminMessaging().sendEachForMulticast({
    tokens,
    notification: {
      title: 'Your Astro101 Plus is expiring soon',
      body: 'Renew now to keep unlimited AI astrologer access.',
    },
  });
}
