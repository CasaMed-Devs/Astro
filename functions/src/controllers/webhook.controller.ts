import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';
import { verifyWebhookSignature } from '../services/razorpay.service';
import { PaymentVerificationError } from '../utils/errors';

interface RazorpayWebhookPayload {
  event: string;
  payload: {
    payment?: { entity: { notes?: Record<string, string> } };
    subscription?: { entity: { notes?: Record<string, string> } };
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

    switch (payload.event) {
      case 'subscription.charged':
        await db
          .collection('subscriptions')
          .doc(uid)
          .set({ status: 'active', updatedAt: now }, { merge: true });
        break;
      case 'subscription.cancelled':
        await db
          .collection('subscriptions')
          .doc(uid)
          .set({ status: 'cancelled', updatedAt: now }, { merge: true });
        break;
      case 'payment.failed':
        await db
          .collection('subscriptions')
          .doc(uid)
          .set({ status: 'failed', updatedAt: now }, { merge: true });
        break;
      default:
        break;
    }
  }

  res.status(200).json({ received: true });
}
