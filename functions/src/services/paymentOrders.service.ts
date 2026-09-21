import { FieldValue } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';

export type PaymentOrderPurpose =
  | 'topup'
  | 'subscription'
  | 'trial'
  | 'direct_subscription'
  | 'report';

/**
 * Remembers every Razorpay order we hand to the app, so reconciliation has
 * something to check against if both the client verify and the webhook miss
 * the payment. Best-effort: a failure here must never block order creation.
 */
export async function recordPaymentOrder(
  orderId: string,
  uid: string,
  purpose: PaymentOrderPurpose,
  amountPaise: number,
): Promise<void> {
  try {
    await adminFirestore().collection('paymentOrders').doc(orderId).set({
      orderId,
      userId: uid,
      purpose,
      amountPaise,
      status: 'created',
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.warn(`[paymentOrders] Failed to record order ${orderId}`, error);
  }
}
