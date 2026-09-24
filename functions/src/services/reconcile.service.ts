import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';
import { getRupeesPerCredit } from '../config/plans';
import { recordKundaliPayment } from '../controllers/payment.controller';
import { creditWallet } from './credits.service';
import { recordTransaction, type TransactionVia } from './transactions.service';
import {
  applySubscriptionPayment,
  completeMandateRegistration,
  reconcileMandateStatus,
} from './mandate.service';
import type { PaymentOrderPurpose } from './paymentOrders.service';
import {
  fetchOrderPayments,
  findMandateTokenId,
  paiseToRupees,
  type OrderPayment,
} from './razorpay.service';
import type { MandateStatus } from '../types';

const ORDER_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ORDERS_PER_RUN = 20;

export type ApplyResult = { status: 'applied'; credits: number } | { status: 'pending' };

/**
 * Applies one captured Razorpay payment to the user's account, by purpose.
 * Shared by reconciliation and the webhook. Every branch reuses an existing
 * idempotent writer keyed by the real Razorpay payment id (payments/{id} or
 * payments/registration_{id}), so the client verify, the webhook and
 * reconciliation can all run for the same payment without double-crediting.
 */
export async function applyCapturedPayment(
  uid: string,
  purpose: string,
  payment: OrderPayment & { order_id?: string | null },
  orderId: string,
  via: TransactionVia,
): Promise<ApplyResult> {
  const options = { via, orderId, paymentMethod: payment.method ?? null };

  switch (purpose) {
    case 'topup': {
      const rupeesPerCredit = await getRupeesPerCredit();
      const result = await creditWallet(
        uid,
        paiseToRupees(Number(payment.amount)),
        payment.id,
        1 / rupeesPerCredit,
        'topup',
      );
      await recordTransaction({
        uid,
        paymentId: payment.id,
        orderId,
        purpose: 'topup',
        status: 'paid',
        amountRupees: paiseToRupees(Number(payment.amount)),
        creditsAwarded: result.creditsAwarded,
        paymentMethod: options.paymentMethod,
        via,
      });
      return { status: 'applied', credits: result.creditsAwarded };
    }

    case 'subscription':
      await applySubscriptionPayment(uid, payment.id, options);
      return { status: 'applied', credits: 0 };

    case 'trial':
    case 'direct_subscription': {
      const userSnapshot = await adminFirestore().collection('users').doc(uid).get();
      const customerId = userSnapshot.data()?.razorpayCustomerId as string | undefined;
      const tokenId = payment.token_id ?? (await findMandateTokenId(payment.id, customerId));
      // Razorpay hasn't issued the mandate token yet — try again next time.
      if (!tokenId) return { status: 'pending' };
      await completeMandateRegistration(uid, tokenId, payment.id, purpose, options);
      return { status: 'applied', credits: 0 };
    }

    case 'report':
      await recordKundaliPayment(
        uid,
        orderId,
        payment.id,
        paiseToRupees(Number(payment.amount)),
        via,
      );
      return { status: 'applied', credits: 0 };

    default:
      return { status: 'applied', credits: 0 };
  }
}

export interface ReconcileResult {
  /** Orders whose captured payment is now fully applied (includes ones the client/webhook had already handled). */
  resolved: { purpose: string; orderId: string }[];
  /** Orders still waiting on a captured payment (or a mandate token). */
  pending: number;
  /**
   * The user's mandate status after checking it against Razorpay directly
   * (see mandate.service.ts's reconcileMandateStatus) — catches a mandate
   * Razorpay has already cancelled/suspended before the next scheduled
   * auto-debit would otherwise be the first thing to notice.
   */
  mandateStatus: MandateStatus;
}

/**
 * Last-resort safety net behind the client verify and the webhook: for the
 * user's recent unresolved orders, ask Razorpay whether a payment was
 * captured and apply it if so. Also re-checks the user's mandate token
 * health directly against Razorpay. Called by the app when it returns to the
 * foreground. Safe to call repeatedly and concurrently.
 */
export async function reconcilePayments(uid: string): Promise<ReconcileResult> {
  const db = adminFirestore();
  const mandateStatus = await reconcileMandateStatus(uid);
  const snapshot = await db
    .collection('paymentOrders')
    .where('userId', '==', uid)
    .where('status', '==', 'created')
    .limit(MAX_ORDERS_PER_RUN)
    .get();

  const resolved: ReconcileResult['resolved'] = [];
  let pending = 0;
  const cutoff = Date.now() - ORDER_LOOKBACK_MS;

  for (const doc of snapshot.docs) {
    const order = doc.data() as {
      purpose: PaymentOrderPurpose;
      createdAt?: Timestamp;
    };
    const orderId = doc.id;

    try {
      const captured = (await fetchOrderPayments(orderId)).find((p) => p.status === 'captured');

      if (!captured) {
        const createdMs = order.createdAt?.toMillis?.() ?? Date.now();
        if (createdMs < cutoff) {
          await doc.ref.set({ status: 'expired', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        } else {
          pending += 1;
        }
        continue;
      }

      const result = await applyCapturedPayment(uid, order.purpose, captured, orderId, 'reconciliation');
      if (result.status === 'pending') {
        pending += 1;
        continue;
      }

      await doc.ref.set(
        {
          status: 'paid',
          razorpayPaymentId: captured.id,
          resolvedVia: 'reconciliation',
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      resolved.push({ purpose: order.purpose, orderId });
    } catch (error) {
      // One bad order must not stop the rest; it stays 'created' and retries next time.
      console.warn(`[reconcile] Order ${orderId} failed for user ${uid}`, error);
      pending += 1;
    }
  }

  return { resolved, pending, mandateStatus };
}
