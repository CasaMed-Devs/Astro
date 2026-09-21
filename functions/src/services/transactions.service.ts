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

/** Purposes that belong to the user's subscription (vs. one-off top-ups / reports). */
const SUBSCRIPTION_PURPOSES: ReadonlySet<TransactionPurpose> = new Set([
  'trial',
  'subscription',
  'direct_subscription',
  'autodebit',
]);

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
 * Relationships (Firestore has no foreign keys, so they are stored as ids and
 * checked here, in the same atomic transaction that writes the record):
 *   users/{uid}  --subscriptionId-->  subscriptions/{uid}  --lastTransactionId-->  transactions/{id}
 *   transactions/{id}  --userId / subscriptionId / orderId-->  users / subscriptions / paymentOrders
 *   payments/{...} and paymentOrders/{orderId}  --transactionId-->  transactions/{id}
 *
 * Integrity checks — the record is refused (logged, never thrown) when:
 *   - the user doc does not exist (no orphan transactions), or
 *   - the order was recorded for a different user (no cross-user links).
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
    const subscriptionRef = db.collection('subscriptions').doc(input.uid);
    const orderRef = input.orderId ? db.collection('paymentOrders').doc(input.orderId) : null;
    const isSubscriptionPurpose = SUBSCRIPTION_PURPOSES.has(input.purpose);

    await db.runTransaction(async (transaction) => {
      // All reads first (Firestore requirement), then writes.
      const [txSnapshot, userSnapshot, orderSnapshot] = await Promise.all([
        transaction.get(txRef),
        transaction.get(userRef),
        orderRef ? transaction.get(orderRef) : Promise.resolve(null),
      ]);

      if (!userSnapshot.exists) {
        console.warn(`[transactions] Refused ${input.paymentId}: user ${input.uid} does not exist`);
        return;
      }
      if (orderSnapshot?.exists && orderSnapshot.data()?.userId !== input.uid) {
        console.warn(
          `[transactions] Refused ${input.paymentId}: order ${input.orderId} belongs to another user`,
        );
        return;
      }

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

      const userData = userSnapshot.data() as { transactionCount?: number; mandateMethod?: string };
      const sequence = (userData.transactionCount ?? 0) + 1;

      transaction.set(txRef, {
        userId: input.uid,
        subscriptionId: isSubscriptionPurpose ? input.uid : null,
        paymentId: input.paymentId,
        orderId: input.orderId ?? null,
        purpose: input.purpose,
        status: input.status,
        amount: input.amountRupees,
        currency: input.currency ?? 'INR',
        creditsAwarded: input.creditsAwarded ?? 0,
        paymentMethod: input.paymentMethod ?? userData.mandateMethod ?? null,
        createdVia: input.via,
        confirmedVia: [input.via],
        sequence,
        failureReason: input.failureReason ?? null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Parent pointers, updated atomically with the transaction itself.
      transaction.update(userRef, {
        transactionCount: FieldValue.increment(1),
        lastTransactionId: input.paymentId,
        ...(isSubscriptionPurpose ? { subscriptionId: input.uid } : {}),
      });
      if (isSubscriptionPurpose && input.status === 'paid') {
        transaction.set(
          subscriptionRef,
          {
            userId: input.uid,
            lastTransactionId: input.paymentId,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
      if (orderRef && orderSnapshot?.exists) {
        transaction.set(orderRef, { transactionId: input.paymentId }, { merge: true });
      }
    });
  } catch (error) {
    console.warn(`[transactions] Failed to record ${input.paymentId} via ${input.via}`, error);
  }
}
