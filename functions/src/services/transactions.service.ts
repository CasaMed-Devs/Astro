import { FieldValue } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';

/** Which path confirmed the payment. */
export type TransactionVia = 'client_verify' | 'webhook' | 'reconciliation' | 'auto_debit';

export type TransactionPurpose =
  | 'topup'
  | 'trial'
  | 'subscription'
  | 'direct_subscription'
  | 'report'
  | 'autodebit';

export interface RecordTransactionInput {
  uid: string;
  paymentId: string;
  orderId?: string | null;
  purpose: TransactionPurpose;
  status: 'paid' | 'failed';
  amountRupees: number;
  currency?: string;
  creditsAwarded?: number;
  paymentMethod?: string | null;
  failureReason?: string | null;
  via: TransactionVia;
}

/**
 * Writes one transactions/{paymentId} doc per Razorpay payment — the
 * user-facing/audit record of what was paid and which channel confirmed it.
 * `payments` stays the idempotency ledger; this collection is additive.
 *
 * Idempotent: the first channel to record a payment becomes `createdVia` and
 * bumps the user's `transactionCount`; any later channel confirming the same
 * payment is only appended to `confirmedVia`.
 *
 * Best-effort by design: a failure here is logged and swallowed so it can
 * never fail or block a real payment.
 */
export async function recordTransaction(input: RecordTransactionInput): Promise<void> {
  try {
    const db = adminFirestore();
    const userRef = db.collection('users').doc(input.uid);
    const txRef = db.collection('transactions').doc(input.paymentId);

    await db.runTransaction(async (transaction) => {
      const [txSnapshot, userSnapshot] = await Promise.all([
        transaction.get(txRef),
        transaction.get(userRef),
      ]);

      if (txSnapshot.exists) {
        const existing = txSnapshot.data() as {
          status?: string;
          confirmedVia?: string[];
        };
        const confirmedVia = existing.confirmedVia ?? [];
        const patch: Record<string, unknown> = {};

        if (!confirmedVia.includes(input.via)) {
          patch.confirmedVia = [...confirmedVia, input.via];
        }
        // A payment first seen as failed that later turns out paid.
        if (existing.status === 'failed' && input.status === 'paid') {
          patch.status = 'paid';
          patch.amount = input.amountRupees;
          patch.creditsAwarded = input.creditsAwarded ?? 0;
          patch.failureReason = null;
        }
        if (Object.keys(patch).length > 0) {
          transaction.update(txRef, { ...patch, updatedAt: FieldValue.serverTimestamp() });
        }
        return;
      }

      const userData = userSnapshot.exists
        ? (userSnapshot.data() as { transactionCount?: number; mandateMethod?: string })
        : undefined;
      const sequence = (userData?.transactionCount ?? 0) + 1;

      transaction.set(txRef, {
        userId: input.uid,
        paymentId: input.paymentId,
        orderId: input.orderId ?? null,
        purpose: input.purpose,
        status: input.status,
        amount: input.amountRupees,
        currency: input.currency ?? 'INR',
        creditsAwarded: input.creditsAwarded ?? 0,
        paymentMethod: input.paymentMethod ?? userData?.mandateMethod ?? null,
        createdVia: input.via,
        confirmedVia: [input.via],
        sequence,
        failureReason: input.failureReason ?? null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (userSnapshot.exists) {
        transaction.update(userRef, { transactionCount: FieldValue.increment(1) });
      }
    });
  } catch (error) {
    console.warn(`[transactions] Failed to record ${input.paymentId} via ${input.via}`, error);
  }
}
