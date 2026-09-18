import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';
import { InsufficientCreditsError, NotFoundError } from '../utils/errors';
import type { SubscriptionRecord, UserProfileRecord } from '../types';

export const SESSION_DURATION_MS = 10 * 60 * 1000;

/**
 * A subscriber keeps unlimited access through the grace period after a
 * failed renewal (subscription.halted), not just while fully 'active' — the
 * point of the grace period is that access doesn't drop the moment a charge
 * fails, only once graceUntil elapses without the scheduled job downgrading it.
 */
function hasUnlimitedAccess(subscription: SubscriptionRecord): boolean {
  if (subscription.status === 'active') return true;
  if (subscription.status === 'past_due') {
    return !subscription.graceUntil || subscription.graceUntil.toMillis() > Date.now();
  }
  return false;
}

export interface SessionResult {
  sessionExpiresAt: string | null; // null when the caller has an unlimited-access subscription
  isNewSession: boolean;
  remainingCredits: number | null; // null when the caller has an unlimited-access subscription
}

interface PersonaChatSessionFields {
  sessionExpiresAt?: Timestamp;
}

/**
 * Checks for an active (unexpired) chat session and, if none exists, starts
 * a new one by atomically decrementing credits — same overspend-proofing as
 * the old per-message entitlement check, just gated on a 10-minute session
 * window instead of every message. Active subscribers bypass entirely and
 * never have a session window at all (no time limit).
 */
export async function assertActiveOrStartSession(
  uid: string,
  chatId: string,
  creditCostPerSession: number,
): Promise<SessionResult> {
  const db = adminFirestore();
  const userRef = db.collection('users').doc(uid);
  const subscriptionRef = db.collection('subscriptions').doc(uid);
  const chatRef = db.collection('personaChats').doc(chatId);

  return db.runTransaction(async (transaction) => {
    const [userSnapshot, subscriptionSnapshot, chatSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(subscriptionRef),
      transaction.get(chatRef),
    ]);

    if (!userSnapshot.exists) {
      throw new NotFoundError('User profile not found.');
    }

    const subscription = subscriptionSnapshot.data() as SubscriptionRecord | undefined;
    if (subscription && hasUnlimitedAccess(subscription)) {
      return { sessionExpiresAt: null, isNewSession: false, remainingCredits: null };
    }

    const user = userSnapshot.data() as UserProfileRecord;
    const chat = chatSnapshot.data() as PersonaChatSessionFields | undefined;
    const now = Date.now();
    const currentExpiryMs = chat?.sessionExpiresAt?.toMillis() ?? 0;

    if (currentExpiryMs > now) {
      return {
        sessionExpiresAt: chat!.sessionExpiresAt!.toDate().toISOString(),
        isNewSession: false,
        remainingCredits: user.credits ?? 0,
      };
    }

    if ((user.credits ?? 0) < creditCostPerSession) {
      throw new InsufficientCreditsError();
    }

    const startedAt = new Date(now);
    const expiresAt = new Date(now + SESSION_DURATION_MS);

    transaction.update(userRef, {
      credits: FieldValue.increment(-creditCostPerSession),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(
      chatRef,
      {
        sessionStartedAt: startedAt,
        sessionExpiresAt: expiresAt,
        lastSessionCreditCost: creditCostPerSession,
      },
      { merge: true },
    );

    return {
      sessionExpiresAt: expiresAt.toISOString(),
      isNewSession: true,
      remainingCredits: (user.credits ?? 0) - creditCostPerSession,
    };
  });
}

export interface SessionStatus {
  sessionActive: boolean;
  sessionExpiresAt: string | null;
  isSubscriber: boolean;
}

/** Read-only session check (no transaction) — used when just opening a chat, not sending a message. */
export async function getSessionStatus(uid: string, chatId: string): Promise<SessionStatus> {
  const db = adminFirestore();
  const [subscriptionSnapshot, chatSnapshot] = await Promise.all([
    db.collection('subscriptions').doc(uid).get(),
    db.collection('personaChats').doc(chatId).get(),
  ]);

  const subscription = subscriptionSnapshot.data() as SubscriptionRecord | undefined;
  if (subscription && hasUnlimitedAccess(subscription)) {
    return { sessionActive: true, sessionExpiresAt: null, isSubscriber: true };
  }

  const chat = chatSnapshot.data() as PersonaChatSessionFields | undefined;
  const expiryMs = chat?.sessionExpiresAt?.toMillis() ?? 0;
  const active = expiryMs > Date.now();

  return {
    sessionActive: active,
    sessionExpiresAt: active ? chat!.sessionExpiresAt!.toDate().toISOString() : null,
    isSubscriber: false,
  };
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
