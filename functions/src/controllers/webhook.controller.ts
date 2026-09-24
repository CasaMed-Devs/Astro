import type { Request, Response } from 'express';

import { adminFirestore } from '../config/firebase-admin';
import { fetchOrder, paiseToRupees, verifyWebhookSignature } from '../services/razorpay.service';
import {
  applyNewMandateEntitlement,
  applyNewMandateRenewal,
  updateNewMandateStatus,
} from '../services/mandate.service';
import { applyCapturedPayment } from '../services/reconcile.service';
import { recordKundaliPayment } from './payment.controller';
import { PaymentVerificationError } from '../utils/errors';
import type { MandateStatus } from '../types';

interface RazorpayPaymentEntity {
  id: string;
  order_id?: string | null;
  amount?: number; // paise
  customer_id?: string | null;
  notes?: Record<string, string>;
  error_description?: string | null;
  method?: string | null;
}

interface RazorpaySubscriptionEntity {
  id: string;
  status: string;
  notes?: Record<string, string>;
}

interface RazorpayWebhookPayload {
  event: string;
  payload: {
    payment?: { entity: RazorpayPaymentEntity };
    subscription?: { entity: RazorpaySubscriptionEntity };
  };
}

// event name -> MandateStatus, for the Subscriptions-API lifecycle events
// that are pure status syncs (no crediting involved).
const SUBSCRIPTION_STATUS_EVENTS: Record<string, MandateStatus> = {
  'subscription.pending': 'pending',
  'subscription.halted': 'halted',
  'subscription.cancelled': 'cancelled',
  'subscription.completed': 'completed',
};

/**
 * Handles Razorpay webhook events. Two kinds of events flow through here:
 *
 *  - `payment.captured` for one-time orders (wallet top-ups, kundali report
 *    unlock) — a safety net alongside the app's own client-side verify call.
 *  - `subscription.*` events for every mandate (trial or paid) — Razorpay
 *    owns the billing schedule and retries entirely; this handler only
 *    mirrors whatever Razorpay reports into Firestore and credits the wallet
 *    when a charge lands.
 *
 * Requires the raw request body — see app.ts, which mounts this route with
 * express.raw() so the signature can be verified against the exact bytes
 * Razorpay sent.
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
  const subscription = payload.payload.subscription?.entity;
  // A subscription entity's own notes (set at creation — see
  // mandate.service.ts's startNewMandateSubscription) are the most reliable
  // source for a subscription.* event, ahead of the payment's own notes.
  let notes = subscription?.notes ?? payment?.notes;
  // Order-based checkout puts uid/purpose on the *order*, not always the
  // payment — recover from the order when the payment event arrives without them.
  if (!notes?.uid && payment?.order_id) {
    notes = await recoverNotesFromOrder(payment.order_id);
  }
  const uid = notes?.uid;
  const purpose = notes?.purpose;

  if (uid) {
    switch (payload.event) {
      case 'payment.captured': {
        // Wallet top-ups and the kundali report unlock — the app's own
        // client-side verify call is the primary path; this is the fallback
        // for when the app closes right after paying.
        if ((purpose === 'topup') && payment) {
          await applyCapturedPayment(
            uid,
            purpose,
            { ...payment, status: 'captured', amount: Number(payment.amount ?? 0) },
            payment.order_id ?? '',
            'webhook',
          );
        }
        if (purpose === 'report' && payment) {
          await recordKundaliPayment(
            uid,
            payment.order_id ?? '',
            payment.id,
            paiseToRupees(Number(payment.amount ?? 0)),
            'webhook',
          );
        }
        break;
      }

      case 'subscription.authenticated': {
        // Razorpay captured the mandate's first payment (the trial addon, or
        // a direct subscription's first bill) but the subscription may not
        // be fully 'active' yet — credit now if there's a payment id to key
        // the idempotency on; otherwise just sync status.
        if (!subscription) break;
        if (payment) {
          await applyNewMandateEntitlement(uid, subscription.id, payment.id, subscription.status, {
            via: 'webhook',
            paymentMethod: payment.method,
          });
        } else {
          await updateNewMandateStatus(uid, subscription.id, 'authenticated', subscription.status);
        }
        break;
      }

      case 'subscription.activated': {
        if (!subscription) break;
        await updateNewMandateStatus(uid, subscription.id, 'active', subscription.status);
        break;
      }

      case 'subscription.charged': {
        // Fires on every successful charge, including the first — distinguish
        // a renewal from the first charge by local cycle state rather than
        // Razorpay's paid_count (trial addon charges aren't counted in it).
        if (!subscription || !payment) break;
        const cycleSnapshot = await adminFirestore().collection('subscriptions').doc(subscription.id).get();
        const cycleStatus = cycleSnapshot.data()?.status;
        const alreadyEntitled = cycleStatus === 'active' || cycleStatus === 'completed';
        if (alreadyEntitled) {
          await applyNewMandateRenewal(uid, subscription.id, payment.id, subscription.status);
        } else {
          await applyNewMandateEntitlement(uid, subscription.id, payment.id, subscription.status, {
            via: 'webhook',
            paymentMethod: payment.method,
          });
        }
        break;
      }

      case 'subscription.pending':
      case 'subscription.halted':
      case 'subscription.cancelled':
      case 'subscription.completed': {
        if (!subscription) break;
        await updateNewMandateStatus(uid, subscription.id, SUBSCRIPTION_STATUS_EVENTS[payload.event], subscription.status);
        break;
      }

      default:
        break;
    }
  }

  res.status(200).json({ received: true });
}

async function recoverNotesFromOrder(orderId: string): Promise<Record<string, string> | undefined> {
  try {
    const order = await fetchOrder(orderId);
    const orderNotes = order.notes as Record<string, string> | undefined;
    return orderNotes?.uid ? orderNotes : undefined;
  } catch {
    return undefined;
  }
}
