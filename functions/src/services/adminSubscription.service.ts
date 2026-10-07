import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';
import { hasLiveAdminGrant, stopMandateForAdmin } from './mandate.service';
import { NotFoundError, ValidationError } from '../utils/errors';
import type { MandateStatus, SubscriptionCycleRecord, UserProfileRecord } from '../types';

/**
 * The dashboard's manual subscription controls ("Access settings"): give,
 * expire and reset a user's subscription, run those actions later on a
 * chosen date, and keep the audit trail of all of it.
 *
 * Collections owned here:
 *   adminLogs/{autoId}              one row per admin action (and per automatic follow-up)
 *   adminScheduledActions/{autoId}  a reset/expire waiting for its date
 * plus users/{uid}.adminSubscription (see UserProfileRecord) and one
 * transactions/{autoId} row per grant, so given credits show up in dispute data.
 */

const USER_NOT_FOUND = 'No user found for that number.';
/** Recorded as the actor when the system itself follows up (a grant running out, a scheduled action firing). */
const SYSTEM_ACTOR = 'system';

export type AdminAction =
  | 'give_subscription'
  | 'expire_subscription'
  | 'reset_subscription'
  | 'schedule_expire'
  | 'schedule_reset'
  | 'grant_expired';

export interface AdminLogInput {
  action: AdminAction;
  adminName: string;
  uid: string;
  outcome: 'success' | 'failed' | 'skipped';
  details?: Record<string, unknown>;
  error?: string;
}

/** Best-effort, like recordTransaction: a failed log write must never fail the action it describes. */
export async function writeAdminLog(input: AdminLogInput): Promise<void> {
  try {
    await adminFirestore().collection('adminLogs').add({
      action: input.action,
      adminName: input.adminName,
      userId: input.uid,
      outcome: input.outcome,
      details: input.details ?? {},
      error: input.error ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.warn(`[adminLogs] Failed to record ${input.action} for ${input.uid}`, error);
  }
}

/** Runs an admin action and records how it went, whichever way it went. */
async function logged<Result extends object>(
  input: Omit<AdminLogInput, 'outcome' | 'details' | 'error'> & { details?: Record<string, unknown> },
  run: () => Promise<Result>,
): Promise<Result> {
  try {
    const result = await run();
    await writeAdminLog({ ...input, outcome: 'success', details: { ...input.details, ...result } });
    return result;
  } catch (error) {
    await writeAdminLog({
      ...input,
      outcome: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

export interface GiveSubscriptionResult {
  previousCredits: number;
  addedCredits: number;
  newCredits: number;
  /** False when the user already had a paid subscription — then only the credits were added. */
  subscriptionApplied: boolean;
  validUntil: string;
  /** Whether this grant also unlocked the kundali report. */
  kundaliUnlocked: boolean;
}

/**
 * Gives a user credits and, unless they already pay for one, a subscription
 * that lasts until `expiresAt`. A user's own paid (Razorpay) subscription is
 * never touched: they just get the credits. Giving again to a user who
 * already holds an admin subscription replaces its end date.
 *
 * `unlockKundali` also opens the kundali report — the same lifetime unlock
 * the one-time payment gives (see report.service.ts's isKundaliUnlocked), so
 * it does not end with the subscription. Leaving it off never takes an
 * existing unlock away.
 */
export async function giveSubscription(
  uid: string,
  expiresAt: Date,
  credits: number,
  adminName: string,
  unlockKundali = false,
): Promise<GiveSubscriptionResult> {
  const validUntil = expiresAt.toISOString();

  return logged({ action: 'give_subscription', adminName, uid, details: { requestedValidUntil: validUntil } }, () => {
    const db = adminFirestore();
    const userRef = db.collection('users').doc(uid);
    const grantRecordRef = db.collection('transactions').doc();

    return db.runTransaction(async (transaction) => {
      const userSnapshot = await transaction.get(userRef);
      if (!userSnapshot.exists) throw new NotFoundError(USER_NOT_FOUND);

      const user = userSnapshot.data() as UserProfileRecord;
      const previousCredits = user.credits ?? 0;
      const hasPaidSubscription = user.mandateStatus === 'active' && !user.adminSubscription;
      const subscriptionApplied = !hasPaidSubscription;

      transaction.update(userRef, {
        credits: FieldValue.increment(credits),
        ...(subscriptionApplied
          ? {
              mandateStatus: 'active',
              adminSubscription: {
                expiresAt: Timestamp.fromDate(expiresAt),
                grantedAt: Timestamp.now(),
                grantedBy: adminName,
              },
              // Keep the original activation time when only extending.
              ...(user.mandateStatus === 'active' ? {} : { subscriptionActivatedAt: FieldValue.serverTimestamp() }),
            }
          : {}),
        ...(unlockKundali && !user.kundaliUnlocked
          ? { kundaliUnlocked: true, kundaliUnlockedAt: FieldValue.serverTimestamp() }
          : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Same shape as a payment's transactions/{id} row (see
      // transactions.service.ts), so dispute data can explain where these
      // credits came from. Not a payment: no money moved, and the user's
      // transactionCount / lastTransactionId stay about real payments.
      transaction.set(grantRecordRef, {
        userId: uid,
        subscriptionId: null,
        paymentId: null,
        orderId: null,
        purpose: 'admin_grant',
        status: 'paid',
        amount: 0,
        currency: 'INR',
        creditsAwarded: credits,
        paymentMethod: null,
        createdVia: 'admin',
        confirmedVia: ['admin'],
        grantedBy: adminName,
        subscriptionApplied,
        validUntil: subscriptionApplied ? Timestamp.fromDate(expiresAt) : null,
        kundaliUnlocked: unlockKundali,
        failureReason: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        previousCredits,
        addedCredits: credits,
        newCredits: previousCredits + credits,
        subscriptionApplied,
        validUntil,
        kundaliUnlocked: unlockKundali,
      };
    });
  });
}

export interface ExpireSubscriptionResult {
  previousStatus: MandateStatus;
  /** Whether a Razorpay auto-debit existed and was stopped. */
  autoDebitCancelled: boolean;
}

/**
 * Ends an active subscription now: stops the Razorpay auto-debit (if any)
 * first, then marks the user 'cancelled' so the app's paywall closes again.
 * Credits already in the wallet are left alone.
 */
export async function expireSubscription(uid: string, adminName: string): Promise<ExpireSubscriptionResult> {
  return logged({ action: 'expire_subscription', adminName, uid }, async () => {
    const userRef = adminFirestore().collection('users').doc(uid);
    const userSnapshot = await userRef.get();
    if (!userSnapshot.exists) throw new NotFoundError(USER_NOT_FOUND);

    const user = userSnapshot.data() as UserProfileRecord;
    if (user.mandateStatus !== 'active') {
      throw new ValidationError('This user does not have an active subscription.');
    }

    const razorpayStatus = user.subscriptionId ? await stopMandateForAdmin(uid, user.subscriptionId) : null;

    await userRef.update({
      mandateStatus: 'cancelled',
      ...(razorpayStatus ? { razorpayStatus } : {}),
      adminSubscription: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { previousStatus: 'active' as MandateStatus, autoDebitCancelled: Boolean(razorpayStatus) };
  });
}

export interface ResetSubscriptionResult {
  previousStatus: MandateStatus;
  previousCredits: number;
  autoDebitCancelled: boolean;
}

/**
 * Puts a user's subscription back to "never subscribed": auto-debit stopped,
 * status 'none', credits 0, and the one-time Rs.1 trial claimable again.
 *
 * Deliberately narrow — the profile, chats, kundali unlock/report and the
 * whole payment history (transactions, payments, the old subscription cycle
 * docs) are untouched. Only the trial-gift ledger doc is removed, because it
 * is what blocks a second trial (see mandate.service.ts's grantTrialCreditsOnce).
 */
export async function resetSubscription(uid: string, adminName: string): Promise<ResetSubscriptionResult> {
  return logged({ action: 'reset_subscription', adminName, uid }, async () => {
    const db = adminFirestore();
    const userRef = db.collection('users').doc(uid);
    const userSnapshot = await userRef.get();
    if (!userSnapshot.exists) throw new NotFoundError(USER_NOT_FOUND);

    const user = userSnapshot.data() as UserProfileRecord;
    if (user.subscriptionId) await stopMandateForAdmin(uid, user.subscriptionId);

    const batch = db.batch();
    batch.update(userRef, {
      mandateStatus: 'none',
      credits: 0,
      trialCreditsClaimed: false,
      // Clearing the pointer detaches the user from the old cycle, so a late
      // Razorpay event for it can't move their status off 'none' — see
      // updateNewMandateStatus.
      subscriptionId: FieldValue.delete(),
      subscriptionActivatedAt: FieldValue.delete(),
      razorpayStatus: FieldValue.delete(),
      mandateMethod: FieldValue.delete(),
      adminSubscription: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.delete(db.collection('payments').doc(`trial_credits_${uid}`));
    await batch.commit();

    return {
      previousStatus: user.mandateStatus ?? 'none',
      previousCredits: user.credits ?? 0,
      autoDebitCancelled: Boolean(user.subscriptionId),
    };
  });
}

export type ScheduledActionType = 'expire' | 'reset';

interface ScheduledActionRecord {
  type: ScheduledActionType;
  userId: string;
  runAt: FirebaseFirestore.Timestamp;
  status: 'scheduled' | 'running' | 'done' | 'failed' | 'skipped' | 'replaced';
  scheduledBy: string;
}

/**
 * Queues a reset/expire for a future date. A user has at most one pending
 * action of each type — scheduling again replaces the earlier date.
 */
export async function scheduleAction(
  type: ScheduledActionType,
  uid: string,
  runAt: Date,
  adminName: string,
): Promise<{ scheduledFor: string }> {
  const action: AdminAction = type === 'expire' ? 'schedule_expire' : 'schedule_reset';

  return logged({ action, adminName, uid }, async () => {
    const db = adminFirestore();
    const userSnapshot = await db.collection('users').doc(uid).get();
    if (!userSnapshot.exists) throw new NotFoundError(USER_NOT_FOUND);
    if (type === 'expire' && (userSnapshot.data() as UserProfileRecord).mandateStatus !== 'active') {
      throw new ValidationError('This user does not have an active subscription.');
    }

    const pending = await db
      .collection('adminScheduledActions')
      .where('userId', '==', uid)
      .where('status', '==', 'scheduled')
      .get();

    const batch = db.batch();
    for (const doc of pending.docs) {
      if ((doc.data() as ScheduledActionRecord).type === type) {
        batch.update(doc.ref, { status: 'replaced', updatedAt: FieldValue.serverTimestamp() });
      }
    }
    batch.set(db.collection('adminScheduledActions').doc(), {
      type,
      userId: uid,
      runAt: Timestamp.fromDate(runAt),
      status: 'scheduled',
      scheduledBy: adminName,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();

    return { scheduledFor: runAt.toISOString() };
  });
}

/** Claims a due action so the sweep and a user's own app-open can't both run it. */
async function claimScheduledAction(ref: FirebaseFirestore.DocumentReference): Promise<ScheduledActionRecord | null> {
  return adminFirestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const record = snapshot.data() as ScheduledActionRecord | undefined;
    if (!record || record.status !== 'scheduled' || record.runAt.toMillis() > Date.now()) return null;

    transaction.update(ref, { status: 'running', updatedAt: FieldValue.serverTimestamp() });
    return record;
  });
}

async function runScheduledAction(ref: FirebaseFirestore.DocumentReference): Promise<void> {
  const record = await claimScheduledAction(ref);
  if (!record) return;

  const actor = `${record.scheduledBy} (scheduled)`;
  let status: ScheduledActionRecord['status'] = 'done';
  let error: string | null = null;

  try {
    if (record.type === 'reset') {
      await resetSubscription(record.userId, actor);
    } else {
      const user = (await adminFirestore().collection('users').doc(record.userId).get()).data() as
        | UserProfileRecord
        | undefined;
      if (user?.mandateStatus === 'active') {
        await expireSubscription(record.userId, actor);
      } else {
        // Ended on its own before the date arrived — nothing left to expire.
        status = 'skipped';
        await writeAdminLog({
          action: 'expire_subscription',
          adminName: actor,
          uid: record.userId,
          outcome: 'skipped',
          details: { reason: 'Subscription was no longer active on the scheduled date.' },
        });
      }
    }
  } catch (caught) {
    // Already written to adminLogs by the action itself; the status here is
    // what tells an admin the scheduled run needs redoing by hand.
    status = 'failed';
    error = caught instanceof Error ? caught.message : 'Unknown error';
    console.error(`[adminScheduledActions] ${record.type} for ${record.userId} failed`, caught);
  }

  await ref.update({ status, error, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
}

/**
 * Ends an admin-given subscription whose date has passed. If the user took
 * out a real paid subscription in the meantime, only the grant is removed
 * and they stay active on their own mandate.
 */
async function expireAdminGrantIfDue(uid: string): Promise<void> {
  const db = adminFirestore();
  const userRef = db.collection('users').doc(uid);

  const ended = await db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    const user = userSnapshot.data() as UserProfileRecord | undefined;
    if (!user?.adminSubscription || hasLiveAdminGrant(user)) return null;

    const cycleSnapshot = user.subscriptionId
      ? await transaction.get(db.collection('subscriptions').doc(user.subscriptionId))
      : null;
    const hasPaidSubscription = (cycleSnapshot?.data() as SubscriptionCycleRecord | undefined)?.status === 'active';

    transaction.update(userRef, {
      adminSubscription: FieldValue.delete(),
      ...(hasPaidSubscription ? {} : { mandateStatus: 'cancelled' }),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { grantedBy: user.adminSubscription.grantedBy, keptPaidSubscription: hasPaidSubscription };
  });

  if (ended) {
    await writeAdminLog({ action: 'grant_expired', adminName: SYSTEM_ACTOR, uid, outcome: 'success', details: ended });
  }
}

/**
 * Applies whatever has come due for one user — called when their app comes
 * to the foreground (reconcile.service.ts), so a user never has to wait for
 * the next sweep to see a subscription end.
 */
export async function settleAdminActionsForUser(uid: string): Promise<void> {
  const pending = await adminFirestore()
    .collection('adminScheduledActions')
    .where('userId', '==', uid)
    .where('status', '==', 'scheduled')
    .get();

  for (const doc of pending.docs) {
    await runScheduledAction(doc.ref);
  }
  await expireAdminGrantIfDue(uid);
}

/**
 * Applies everything that has come due, for every user — the scheduled sweep
 * (triggers/adminActionsSweep.ts). This is what makes a future-dated expiry
 * stop the auto-debit on time even if the user never opens the app.
 */
export async function runDueAdminActions(): Promise<void> {
  const db = adminFirestore();

  // Filtered by date in claimScheduledAction rather than in the query: the
  // pending set is small, and this avoids needing a composite index.
  const pending = await db.collection('adminScheduledActions').where('status', '==', 'scheduled').get();
  for (const doc of pending.docs) {
    await runScheduledAction(doc.ref);
  }

  const lapsedGrants = await db
    .collection('users')
    .where('adminSubscription.expiresAt', '<=', Timestamp.now())
    .get();
  for (const doc of lapsedGrants.docs) {
    await expireAdminGrantIfDue(doc.id);
  }
}
