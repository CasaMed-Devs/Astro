import { FieldValue } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';
import { cancelSubscription, fetchSubscription } from './razorpay.service';
import { logged } from './adminSubscription.service';
import { HttpError, NotFoundError } from '../utils/errors';
import type { MandateStatus, SubscriptionCycleRecord, UserProfileRecord } from '../types';

// Razorpay will never charge a subscription in one of these states again.
const ENDED_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set(['cancelled', 'completed', 'expired']);

export class SubscriptionCancellationError extends HttpError {
  constructor(
    message = 'We could not cancel your subscription, so your account was not deleted. Please try again in a moment.',
  ) {
    super(502, message);
  }
}

/**
 * Stops Razorpay from ever charging this subscription again. Runs before any
 * data is removed and throws if the mandate can't be confirmed dead —
 * otherwise a deleted user could still be auto-debited every month, with no
 * account left to cancel from. Returns whether a live mandate was actually
 * cancelled here.
 */
export async function cancelLiveSubscription(
  uid: string,
  subscriptionId: string | undefined,
  failure: () => SubscriptionCancellationError = () => new SubscriptionCancellationError(),
): Promise<boolean> {
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
      throw failure();
    }
    if (!ENDED_SUBSCRIPTION_STATUSES.has(razorpayStatus)) {
      console.error(`[account] Subscription ${subscriptionId} is still ${razorpayStatus}`, error);
      throw failure();
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

/**
 * Deletes every chat the user has. `chats` is the pre-Persona-API message
 * store, kept for accounts that still have docs in it (its messages live in
 * a subcollection, which recursiveDelete takes with it); `personaChats` is
 * what chat.service.ts uses today.
 */
export async function deleteUserChats(uid: string): Promise<number> {
  const db = adminFirestore();
  const [chatsSnapshot, personaChatsSnapshot] = await Promise.all([
    db.collection('chats').where('userId', '==', uid).get(),
    db.collection('personaChats').where('userId', '==', uid).get(),
  ]);
  const refs = [...chatsSnapshot.docs, ...personaChatsSnapshot.docs].map((doc) => doc.ref);
  await Promise.all(refs.map((ref) => db.recursiveDelete(ref)));
  return refs.length;
}

/** What a full admin deletion removes, counted per kind — the dashboard shows this before and after. */
export interface UserDataCounts {
  chats: number;
  subscriptions: number;
  transactions: number;
  payments: number;
  paymentOrders: number;
  scheduledActions: number;
  /** The user doc, birth-details profile and kundali report. */
  profileDocs: number;
}

interface UserDocuments {
  user: UserProfileRecord;
  refs: Record<keyof UserDataCounts, FirebaseFirestore.DocumentReference[]>;
}

const USER_NOT_FOUND = 'No user found for that number.';

async function idsWhereUser(collection: string, field: 'userId' | 'uid', uid: string) {
  const snapshot = await adminFirestore().collection(collection).where(field, '==', uid).get();
  return snapshot.docs.map((doc) => doc.ref);
}

/** Finds every document that belongs to one user, across every collection that stores user data. */
async function findUserDocuments(uid: string): Promise<UserDocuments> {
  const db = adminFirestore();
  const userRef = db.collection('users').doc(uid);
  const userSnapshot = await userRef.get();
  if (!userSnapshot.exists) throw new NotFoundError(USER_NOT_FOUND);
  const user = userSnapshot.data() as UserProfileRecord;

  const [chats, personaChats, subscriptions, transactions, payments, paymentOrders, scheduledActions, userProfiles, report] =
    await Promise.all([
      idsWhereUser('chats', 'userId', uid),
      idsWhereUser('personaChats', 'userId', uid),
      idsWhereUser('subscriptions', 'userId', uid),
      idsWhereUser('transactions', 'userId', uid),
      idsWhereUser('payments', 'userId', uid),
      idsWhereUser('paymentOrders', 'userId', uid),
      idsWhereUser('adminScheduledActions', 'userId', uid),
      idsWhereUser('userProfiles', 'uid', uid),
      db.collection('reports').doc(uid).get(),
    ]);

  // The pointer from the user doc too, in case an old profile lacks its `uid` field.
  const profileRefs = new Map(userProfiles.map((ref) => [ref.id, ref]));
  if (user.userProfileId) profileRefs.set(user.userProfileId, db.collection('userProfiles').doc(user.userProfileId));

  return {
    user,
    refs: {
      chats: [...chats, ...personaChats],
      subscriptions,
      transactions,
      payments,
      paymentOrders,
      scheduledActions,
      profileDocs: [userRef, ...profileRefs.values(), ...(report.exists ? [report.ref] : [])],
    },
  };
}

function countsOf(refs: UserDocuments['refs']): UserDataCounts {
  return {
    chats: refs.chats.length,
    subscriptions: refs.subscriptions.length,
    transactions: refs.transactions.length,
    payments: refs.payments.length,
    paymentOrders: refs.paymentOrders.length,
    scheduledActions: refs.scheduledActions.length,
    profileDocs: refs.profileDocs.length,
  };
}

/** Read-only: what deleting this user would remove. */
export async function previewUserDeletion(uid: string): Promise<UserDataCounts> {
  return countsOf((await findUserDocuments(uid)).refs);
}

export interface PurgeUserResult {
  deleted: UserDataCounts;
  /** How many live Razorpay auto-debits were stopped. */
  subscriptionsCancelled: number;
}

/**
 * Admin-side "delete everything": unlike the user's own deletion
 * (account.controller.ts), which keeps payment records for accounting, this
 * also removes subscriptions, transactions, payments and payment orders.
 *
 * Every live Razorpay mandate is stopped first; if any one can't be, nothing
 * is deleted. The users/{uid} doc goes last, so a run that fails partway can
 * simply be retried from the dashboard. What survives: the admin log entry
 * for this deletion (who did it, and when), and one anonymous
 * accountDeletions row, as for a self-deletion.
 */
export async function purgeUserAccount(uid: string, adminName: string): Promise<PurgeUserResult> {
  return logged({ action: 'delete_account', adminName, uid }, async () => {
    const db = adminFirestore();
    const { refs } = await findUserDocuments(uid);

    let subscriptionsCancelled = 0;
    for (const ref of refs.subscriptions) {
      const cancelled = await cancelLiveSubscription(
        uid,
        ref.id,
        () =>
          new SubscriptionCancellationError(
            `Could not cancel auto-debit ${ref.id} at Razorpay, so nothing was deleted. Please try again in a moment.`,
          ),
      );
      if (cancelled) subscriptionsCancelled += 1;
    }

    const [userRef, ...otherProfileDocs] = refs.profileDocs;
    const everythingButUser = [
      ...refs.chats,
      ...refs.subscriptions,
      ...refs.transactions,
      ...refs.payments,
      ...refs.paymentOrders,
      ...refs.scheduledActions,
      ...otherProfileDocs,
      // Not found by the userId query: the trial gift's idempotency guard.
      db.collection('payments').doc(`trial_credits_${uid}`),
    ];
    await Promise.all(everythingButUser.map((ref) => db.recursiveDelete(ref)));
    await db.recursiveDelete(userRef);

    await db.collection('accountDeletions').add({
      reason: 'admin_deleted',
      details: null,
      deletedBy: adminName,
      subscriptionCancelled: subscriptionsCancelled > 0,
      deletedAt: FieldValue.serverTimestamp(),
    });

    return { deleted: countsOf(refs), subscriptionsCancelled };
  });
}
