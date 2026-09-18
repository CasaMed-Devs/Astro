import { FieldValue } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';
import { InsufficientCreditsError, NotFoundError } from '../utils/errors';
import type { UserProfileRecord } from '../types';

/** Every chat message costs exactly this many credits — no per-astrologer rate, no session window. */
export const CREDIT_COST_PER_MESSAGE = 1;

export interface DeductMessageCreditResult {
  remainingCredits: number;
}

/**
 * Atomically deducts one credit for a single outgoing chat message. There is
 * no session/time-window concept and no per-astrologer rate — every message,
 * to any astrologer, costs exactly CREDIT_COST_PER_MESSAGE credits, checked
 * and charged fresh each time to prevent overspend under concurrent sends.
 */
export async function deductMessageCredit(uid: string): Promise<DeductMessageCreditResult> {
  const db = adminFirestore();
  const userRef = db.collection('users').doc(uid);

  return db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    if (!userSnapshot.exists) {
      throw new NotFoundError('User profile not found.');
    }

    const user = userSnapshot.data() as UserProfileRecord;
    const currentCredits = user.credits ?? 0;

    if (currentCredits < CREDIT_COST_PER_MESSAGE) {
      throw new InsufficientCreditsError();
    }

    transaction.update(userRef, {
      credits: FieldValue.increment(-CREDIT_COST_PER_MESSAGE),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { remainingCredits: currentCredits - CREDIT_COST_PER_MESSAGE };
  });
}

export async function getRemainingCredits(uid: string): Promise<number | null> {
  const snapshot = await adminFirestore().collection('users').doc(uid).get();
  if (!snapshot.exists) return null;
  return (snapshot.data() as UserProfileRecord).credits ?? 0;
}

export interface CreditWalletResult {
  creditsAwarded: number;
  newBalance: number;
  alreadyProcessed: boolean;
}

/**
 * Credits a user's wallet (chat credits) after a verified top-up payment.
 * Keyed by razorpayPaymentId as the payments doc id so duplicate calls (a
 * retried /verify request or a redelivered webhook) never double-credit —
 * the transaction reads the payment doc first and is a no-op if it exists.
 */
export async function creditWallet(
  uid: string,
  amountRupees: number,
  razorpayPaymentId: string,
  creditsPerRupee: number,
): Promise<CreditWalletResult> {
  const db = adminFirestore();
  const userRef = db.collection('users').doc(uid);
  const paymentRef = db.collection('payments').doc(razorpayPaymentId);

  return db.runTransaction(async (transaction) => {
    const [paymentSnapshot, userSnapshot] = await Promise.all([
      transaction.get(paymentRef),
      transaction.get(userRef),
    ]);

    if (!userSnapshot.exists) {
      throw new NotFoundError('User profile not found.');
    }

    const currentCredits = (userSnapshot.data() as UserProfileRecord).credits ?? 0;

    if (paymentSnapshot.exists) {
      return { creditsAwarded: 0, newBalance: currentCredits, alreadyProcessed: true };
    }

    const creditsAwarded = Math.floor(amountRupees * creditsPerRupee);

    transaction.update(userRef, {
      credits: FieldValue.increment(creditsAwarded),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(paymentRef, {
      userId: uid,
      razorpayPaymentId,
      purpose: 'topup',
      amount: amountRupees, // Rupees, like every other stored/displayed amount in this app.
      creditsAwarded,
      status: 'paid',
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      creditsAwarded,
      newBalance: currentCredits + creditsAwarded,
      alreadyProcessed: false,
    };
  });
}
