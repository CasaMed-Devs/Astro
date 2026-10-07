import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import { adminFirestore } from '../config/firebase-admin';
import { cancelSubscription, fetchSubscription } from '../services/razorpay.service';
import { HttpError, UnauthorizedError } from '../utils/errors';
import type { MandateStatus, SubscriptionCycleRecord, UserProfileRecord } from '../types';

// Mirrors DELETE_REASONS in the app's app/account/delete.tsx.
const DELETION_REASONS = [
  'no_longer_use',
  'unmet_expectations',
  'payment_issue',
  'privacy_concerns',
  'too_many_notifications',
  'technical_issues',
  'created_by_mistake',
  'switching_app',
  'other',
] as const;

// Every field is optional: app versions released before the reason picker
// existed call this endpoint with no body at all.
const deleteAccountSchema = z
  .object({
    reason: z.enum(DELETION_REASONS).optional(),
    details: z.string().trim().max(500).optional(),
  })
  .refine((body) => body.reason !== 'other' || Boolean(body.details), {
    message: 'Please tell us your reason.',
    path: ['details'],
  });

// Razorpay will never charge a subscription in one of these states again.
const ENDED_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set(['cancelled', 'completed', 'expired']);

class SubscriptionCancellationError extends HttpError {
  constructor() {
    super(
      502,
      'We could not cancel your subscription, so your account was not deleted. Please try again in a moment.',
    );
  }
}

async function deleteCollection(path: string): Promise<void> {
  const db = adminFirestore();
  const snapshot = await db.collection(path).get();
  await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
}

/**
 * Stops Razorpay from ever charging this user again. Runs before any data is
 * removed and throws if the mandate can't be confirmed dead — otherwise a
 * user could delete their account and still be auto-debited every month,
 * with no account left to cancel from. Returns whether a live mandate was
 * actually cancelled here.
 */
async function cancelLiveSubscription(uid: string, subscriptionId: string | undefined): Promise<boolean> {
  // A cycle whose id isn't a real Razorpay one (mandate.service.ts's
  // generated-id self-heal path) has nothing on Razorpay's side to cancel.
  if (!subscriptionId?.startsWith('sub_')) return false;

  const cycleRef = adminFirestore().collection('subscriptions').doc(subscriptionId);
  const cycle = (await cycleRef.get()).data() as SubscriptionCycleRecord | undefined;
  if (cycle && ENDED_SUBSCRIPTION_STATUSES.has(cycle.status)) return false;

  let razorpayStatus: string;
  try {
    // Immediately, not at cycle end — there is no account left to keep access for.
    razorpayStatus = (await cancelSubscription(subscriptionId, false)).status;
  } catch (error) {
    // Razorpay rejects cancelling an already-ended subscription; that is
    // still the outcome we need, so confirm it before giving up.
    try {
      razorpayStatus = (await fetchSubscription(subscriptionId)).status;
    } catch {
      console.error(`[account] Could not cancel or fetch subscription ${subscriptionId}`, error);
      throw new SubscriptionCancellationError();
    }
    if (!ENDED_SUBSCRIPTION_STATUSES.has(razorpayStatus)) {
      console.error(`[account] Subscription ${subscriptionId} is still ${razorpayStatus}`, error);
      throw new SubscriptionCancellationError();
    }
  }

  // Written here rather than left to the subscription.cancelled webhook: by
  // the time that arrives the user doc is gone and the webhook ignores it.
  await cycleRef.set(
    {
      userId: uid,
      status: razorpayStatus as MandateStatus,
      razorpayStatus,
      cancelledReason: 'account_deleted',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return true;
}

export async function deleteAccount(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();
  const { uid } = req;
  const { reason, details } = deleteAccountSchema.parse(req.body ?? {});

  const db = adminFirestore();

  const userSnapshot = await db.collection('users').doc(uid).get();
  const user = userSnapshot.data() as UserProfileRecord | undefined;

  const subscriptionCancelled = await cancelLiveSubscription(uid, user?.subscriptionId);

  // `chats` is the pre-Persona-API message store, kept here for accounts that
  // still have docs in it; `personaChats` is what chat.service.ts uses today.
  const [chatsSnapshot, personaChatsSnapshot] = await Promise.all([
    db.collection('chats').where('userId', '==', uid).get(),
    db.collection('personaChats').where('userId', '==', uid).get(),
  ]);
  await Promise.all([
    ...chatsSnapshot.docs.map(async (chatDoc) => {
      await deleteCollection(`chats/${chatDoc.id}/messages`);
      await chatDoc.ref.delete();
    }),
    ...personaChatsSnapshot.docs.map((chatDoc) => chatDoc.ref.delete()),
  ]);

  // Mandate state lives on the user doc itself, so deleting it also drops
  // the saved Razorpay token reference — no separate subscription doc.
  //
  // payments/trial_credits_{uid} is deliberately included here even though
  // this function otherwise leaves financial/audit records alone
  // (transactions, subscriptions, payments/{paymentId}) — it isn't a real
  // payment record, it's purely an internal idempotency guard keyed by phone
  // number (see credits.service.ts... mandate.service.ts's
  // grantTrialCreditsOnce). Leaving it meant a user who deleted their
  // account and signed up again with the same number would pay for the
  // Rs.1 trial a second time and receive zero credits — the code would see
  // the stale ledger from the deleted account and assume the one-time gift
  // was already given. Confirmed live in production before this fix.
  await Promise.all([
    db.collection('users').doc(uid).delete(),
    db.collection('reports').doc(uid).delete(),
    db.collection('payments').doc(`trial_credits_${uid}`).delete(),
    user?.userProfileId
      ? db.collection('userProfiles').doc(user.userProfileId).delete()
      : Promise.resolve(),
  ]);

  // Why people leave, for product review. Carries no phone number or uid, so
  // it can outlive the account it describes. Skipped on a retry of an
  // already-completed deletion so one departure is never counted twice.
  if (userSnapshot.exists) {
    await db.collection('accountDeletions').add({
      reason: reason ?? 'unspecified',
      details: reason === 'other' ? (details ?? null) : null,
      subscriptionCancelled,
      deletedAt: FieldValue.serverTimestamp(),
    });
  }

  res.status(204).send();
}
