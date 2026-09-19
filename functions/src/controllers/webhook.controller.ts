import type { Request, Response } from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { adminFirestore, adminMessaging } from '../config/firebase-admin';
import { fetchOrder, verifyWebhookSignature } from '../services/razorpay.service';
import { completeMandateRegistration } from '../services/mandate.service';
import { PaymentVerificationError } from '../utils/errors';
import type { UserProfileRecord } from '../types';

const GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;

interface RazorpayPaymentEntity {
  id: string;
  order_id?: string | null;
  token_id?: string | null;
  customer_id?: string | null;
  notes?: Record<string, string>;
  error_description?: string | null;
}

interface RazorpayTokenEntity {
  id: string;
  customer_id?: string | null;
  notes?: Record<string, string>;
}

interface RazorpayWebhookPayload {
  event: string;
  payload: {
    payment?: { entity: RazorpayPaymentEntity };
    token?: { entity: RazorpayTokenEntity };
  };
}

/**
 * Handles Razorpay webhook events for the custom recurring engine (mandate
 * registration + auto-debit charges). Requires the raw request body — see
 * app.ts, which mounts this route with express.raw() so the signature can
 * be verified against the exact bytes Razorpay sent.
 *
 * Event contract (Razorpay Recurring Payments): a registration completes
 * with `payment.captured` carrying a `token_id`, and separately
 * `token.confirmed`. We treat `payment.captured` + `token_id` + our
 * `purpose` note as the registration-complete signal (it carries everything
 * we need in one event); `token.confirmed` is handled as a fallback for the
 * same transition. Subsequent auto-debits we initiate ourselves are credited
 * synchronously in mandate.service.ts, so their `payment.captured` is a
 * no-op here; `payment.failed` on an auto-debit opens the grace period.
 */
export async function handleRazorpayWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.headers['x-razorpay-signature'];
  if (typeof signature !== 'string') {
    throw new PaymentVerificationError('Missing webhook signature.');
  }

  const rawBody = (req.body as Buffer).toString('utf8');
  verifyWebhookSignature(rawBody, signature);

  const payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
  const payment = payload.payload.payment?.entity;
  const token = payload.payload.token?.entity;
  let notes = payment?.notes ?? token?.notes;
  // Order-based checkout puts uid/purpose on the *order*, not the payment, so
  // a payment/token event can arrive without them — recover from the order,
  // or from the Razorpay customer we stored on the user.
  if (!notes?.uid) {
    notes = (await recoverNotes(payment, token)) ?? notes;
  }
  const uid = notes?.uid;
  const purpose = notes?.purpose;

  if (uid) {
    switch (payload.event) {
      case 'payment.captured': {
        const isRegistration = purpose === 'trial' || purpose === 'direct_subscription';
        if (isRegistration && payment?.token_id) {
          await completeMandateRegistration(uid, payment.token_id, payment.id, purpose);
        }
        break;
      }

      case 'token.confirmed': {
        // Fallback path if the registration's payment.captured arrived
        // without a token_id (or was missed): the token event alone still
        // lets us activate the mandate. completeMandateRegistration is
        // idempotent, keyed by the id we pass, so double-handling is safe.
        const isRegistration = purpose === 'trial' || purpose === 'direct_subscription';
        if (isRegistration && token) {
          await completeMandateRegistration(uid, token.id, `token_${token.id}`, purpose);
        }
        break;
      }

      case 'payment.failed': {
        if (purpose === 'autodebit') {
          await adminFirestore()
            .collection('users')
            .doc(uid)
            .set(
              {
                graceUntil: Timestamp.fromMillis(Date.now() + GRACE_PERIOD_MS),
                lastPaymentFailureReason:
                  payment?.error_description ?? 'Auto-debit payment failed.',
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true },
            );
          await sendAutoDebitFailedNotification(uid);
        }
        break;
      }

      default:
        break;
    }
  }

  res.status(200).json({ received: true });
}

async function recoverNotes(
  payment?: RazorpayPaymentEntity,
  token?: RazorpayTokenEntity,
): Promise<Record<string, string> | undefined> {
  if (payment?.order_id) {
    try {
      const order = await fetchOrder(payment.order_id);
      const orderNotes = order.notes as Record<string, string> | undefined;
      if (orderNotes?.uid) return orderNotes;
    } catch {
      // fall through to the customer lookup
    }
  }

  const customerId = payment?.customer_id ?? token?.customer_id;
  if (!customerId) return undefined;

  const snapshot = await adminFirestore()
    .collection('users')
    .where('razorpayCustomerId', '==', customerId)
    .limit(1)
    .get();
  const doc = snapshot.docs[0];
  if (!doc) return undefined;

  const user = doc.data() as UserProfileRecord;
  // Only a user with a registration in flight is completing one; anything
  // else (e.g. an auto-debit) always carries its own notes.
  if (user.mandateStatus !== 'pending') return undefined;
  return { uid: doc.id, purpose: user.trialCreditsClaimed ? 'direct_subscription' : 'trial' };
}

async function sendAutoDebitFailedNotification(uid: string): Promise<void> {
  const userSnapshot = await adminFirestore().collection('users').doc(uid).get();
  if (!userSnapshot.exists) return;

  const user = userSnapshot.data() as UserProfileRecord & { fcmTokens?: string[] };
  const tokens = user.fcmTokens ?? [];
  if (tokens.length === 0) return;

  await adminMessaging().sendEachForMulticast({
    tokens,
    notification: {
      title: 'Your Astro101 auto-debit failed',
      body: 'Update your payment method within 3 days to keep your monthly credits coming.',
    },
  });
}
