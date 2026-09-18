import type { Request, Response } from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { adminFirestore, adminMessaging } from '../config/firebase-admin';
import { verifyWebhookSignature } from '../services/razorpay.service';
import { PaymentVerificationError } from '../utils/errors';
import type { UserProfileRecord } from '../types';

const GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

interface RazorpaySubscriptionEntity {
  id: string;
  notes?: Record<string, string>;
  current_start?: number | null;
  current_end?: number | null;
}

interface RazorpayWebhookPayload {
  event: string;
  payload: {
    payment?: { entity: { id: string; notes?: Record<string, string> } };
    subscription?: { entity: RazorpaySubscriptionEntity };
  };
}

/**
 * Handles Razorpay webhook events (subscription lifecycle, failed
 * payments). Requires the raw request body — see app.ts, which mounts
 * this route with express.raw() instead of the global JSON parser so the
 * signature can be verified against the exact bytes Razorpay sent.
 */
export async function handleRazorpayWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.headers['x-razorpay-signature'];
  if (typeof signature !== 'string') {
    throw new PaymentVerificationError('Missing webhook signature.');
  }

  const rawBody = (req.body as Buffer).toString('utf8');
  verifyWebhookSignature(rawBody, signature);

  const payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
  const notes = payload.payload.payment?.entity.notes ?? payload.payload.subscription?.entity.notes;
  const uid = notes?.uid;

  if (uid) {
    const db = adminFirestore();
    const now = FieldValue.serverTimestamp();
    const subscriptionEntity = payload.payload.subscription?.entity;

    switch (payload.event) {
      case 'subscription.activated':
        await db.collection('subscriptions').doc(uid).set(
          {
            status: 'active',
            razorpaySubscriptionId: subscriptionEntity?.id,
            graceUntil: FieldValue.delete(),
            updatedAt: now,
          },
          { merge: true },
        );
        break;

      case 'subscription.charged': {
        const update: Record<string, unknown> = {
          status: 'active',
          razorpaySubscriptionId: subscriptionEntity?.id,
          graceUntil: FieldValue.delete(),
          updatedAt: now,
        };
        if (subscriptionEntity?.current_start) {
          update.currentPeriodStart = Timestamp.fromMillis(subscriptionEntity.current_start * 1000);
        }
        if (subscriptionEntity?.current_end) {
          update.currentPeriodEnd = Timestamp.fromMillis(subscriptionEntity.current_end * 1000);
        }
        await db.collection('subscriptions').doc(uid).set(update, { merge: true });

        // Idempotent ledger entry for the renewal charge, keyed by payment id.
        const paymentId = payload.payload.payment?.entity.id;
        if (paymentId) {
          await db
            .collection('payments')
            .doc(paymentId)
            .set(
              {
                userId: uid,
                razorpaySubscriptionId: subscriptionEntity?.id,
                razorpayPaymentId: paymentId,
                purpose: 'subscription',
                status: 'paid',
                createdAt: now,
              },
              { merge: true },
            );
        }
        break;
      }

      case 'subscription.halted': {
        const graceUntil = Timestamp.fromMillis(Date.now() + GRACE_PERIOD_MS);
        await db.collection('subscriptions').doc(uid).set(
          {
            status: 'past_due',
            graceUntil,
            lastPaymentFailureReason: 'Renewal payment failed (subscription.halted).',
            updatedAt: now,
          },
          { merge: true },
        );
        await sendRenewalFailedNotification(uid);
        break;
      }

      case 'subscription.cancelled':
        await db
          .collection('subscriptions')
          .doc(uid)
          .set({ status: 'cancelled', updatedAt: now }, { merge: true });
        break;

      case 'subscription.completed':
        await db
          .collection('subscriptions')
          .doc(uid)
          .set({ status: 'expired', updatedAt: now }, { merge: true });
        break;

      case 'payment.failed':
        // Only relevant to non-subscription orders (top-up/report); the
        // subscription case is handled via subscription.halted above.
        break;

      default:
        break;
    }
  }

  res.status(200).json({ received: true });
}

async function sendRenewalFailedNotification(uid: string): Promise<void> {
  const userSnapshot = await adminFirestore().collection('users').doc(uid).get();
  if (!userSnapshot.exists) return;

  const user = userSnapshot.data() as UserProfileRecord & { fcmTokens?: string[] };
  const tokens = user.fcmTokens ?? [];
  if (tokens.length === 0) return;

  await adminMessaging().sendEachForMulticast({
    tokens,
    notification: {
      title: 'Your Astro101 Plus payment failed',
      body: 'Update your payment method within 3 days to keep unlimited access.',
    },
  });
}
