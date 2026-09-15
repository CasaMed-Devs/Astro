import { FieldValue } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';
import { InsufficientCreditsError, NotFoundError } from '../utils/errors';
import type { SubscriptionRecord, UserProfileRecord } from '../types';

/**
 * Checks entitlement and, for free-tier users, atomically decrements
 * credits inside a transaction so concurrent requests can never overspend
 * a user's balance. Active subscribers bypass the credit check entirely.
 */
export async function assertAndConsumeEntitlement(uid: string, creditCost: number): Promise<void> {
  const db = adminFirestore();
  const userRef = db.collection('users').doc(uid);
  const subscriptionRef = db.collection('subscriptions').doc(uid);

  await db.runTransaction(async (transaction) => {
    const [userSnapshot, subscriptionSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(subscriptionRef),
    ]);

    if (!userSnapshot.exists) {
      throw new NotFoundError('User profile not found.');
    }

    const subscription = subscriptionSnapshot.data() as SubscriptionRecord | undefined;
    if (subscription?.status === 'active') {
      return;
    }

    const user = userSnapshot.data() as UserProfileRecord;
    if ((user.credits ?? 0) < creditCost) {
      throw new InsufficientCreditsError();
    }

    transaction.update(userRef, {
      credits: FieldValue.increment(-creditCost),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function getRemainingCredits(uid: string): Promise<number | null> {
  const snapshot = await adminFirestore().collection('users').doc(uid).get();
  if (!snapshot.exists) return null;
  return (snapshot.data() as UserProfileRecord).credits ?? 0;
}
