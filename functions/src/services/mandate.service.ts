import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';
import { getRupeesPerCredit, getSubscriptionAmount, getTrialAmount } from '../config/plans';
import { chargeRecurringToken, createRecurringRegistration } from './razorpay.service';
import { creditWallet } from './credits.service';
import { NotFoundError, ValidationError } from '../utils/errors';
import type { MandateMethod, UserProfileRecord } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;
const GRACE_PERIOD_MS = 3 * DAY_MS;

async function getUserOrThrow(uid: string): Promise<UserProfileRecord> {
  const snapshot = await adminFirestore().collection('users').doc(uid).get();
  if (!snapshot.exists) throw new NotFoundError('User profile not found.');
  return snapshot.data() as UserProfileRecord;
}

/**
 * Grants the one-time 5-credit trial gift, idempotent per user forever (not
 * just per payment) — keyed by a fixed ledger doc id so even a retried
 * completion call can't grant it twice, on top of the trialCreditsClaimed
 * flag fast-path check.
 */
async function grantTrialCreditsOnce(uid: string): Promise<void> {
  const db = adminFirestore();
  const userRef = db.collection('users').doc(uid);
  const ledgerRef = db.collection('payments').doc(`trial_credits_${uid}`);

  await db.runTransaction(async (transaction) => {
    const [userSnapshot, ledgerSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(ledgerRef),
    ]);
    if (!userSnapshot.exists) throw new NotFoundError('User profile not found.');
    if (ledgerSnapshot.exists) return; // already granted, ever

    const user = userSnapshot.data() as UserProfileRecord;
    if (user.trialCreditsClaimed) return;

    transaction.update(userRef, {
      credits: FieldValue.increment(5),
      trialCreditsClaimed: true,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(ledgerRef, {
      userId: uid,
      purpose: 'trial',
      creditsAwarded: 5,
      status: 'paid',
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

export interface StartRegistrationResult {
  registrationLinkId: string;
  shortUrl: string;
}

/**
 * Kicks off mandate registration — used both for the Rs.1 trial (first-time
 * users) and for "upgrade now" when no mandate exists yet (skips the trial,
 * registers directly at the subscription amount). The actual mandate/credit
 * grant only happens once Razorpay confirms via webhook — this call just
 * returns the hosted page the user completes.
 */
async function startRegistration(
  uid: string,
  method: MandateMethod,
  amountRupees: number,
  purpose: 'trial' | 'direct_subscription',
): Promise<StartRegistrationResult> {
  const user = await getUserOrThrow(uid);

  // Razorpay's registration-link API takes an inline customer object (not a
  // pre-existing customer_id) and creates/matches the Customer itself — we
  // don't collect email anywhere in this app, so a stable synthetic one is
  // used purely as a Razorpay-required identifier field.
  const registration = await createRecurringRegistration(
    user.name ?? 'Astro101 User',
    `${uid}@users.astro101.app`,
    user.phoneNumber,
    amountRupees,
    method,
    { uid, purpose },
  );

  await adminFirestore().collection('users').doc(uid).set(
    {
      razorpayCustomerId: registration.customerId,
      mandateMethod: method,
      mandateStatus: 'pending',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { registrationLinkId: registration.registrationLinkId, shortUrl: registration.shortUrl };
}

export async function startTrial(
  uid: string,
  method: MandateMethod,
): Promise<StartRegistrationResult> {
  const trial = await getTrialAmount();
  return startRegistration(uid, method, trial.amount, 'trial');
}

/**
 * Called from the webhook once Razorpay confirms the registration payment +
 * token. Idempotent: keyed by a `registration_${paymentId}` ledger doc — a
 * *different* doc id from the one creditWallet() uses for the same
 * paymentId below, since otherwise creditWallet would see this function's
 * own ledger write and treat the credit as already processed, silently
 * skipping it. A redelivered webhook is still a no-op on both sides (the
 * trial-credit grant has its own separate idempotency guard, see
 * grantTrialCreditsOnce; creditWallet has its own, keyed by paymentId).
 */
export async function completeMandateRegistration(
  uid: string,
  tokenId: string,
  paymentId: string,
  purpose: 'trial' | 'direct_subscription',
): Promise<void> {
  const db = adminFirestore();
  const userRef = db.collection('users').doc(uid);
  const ledgerRef = db.collection('payments').doc(`registration_${paymentId}`);

  const alreadyProcessed = await db.runTransaction(async (transaction) => {
    const ledgerSnapshot = await transaction.get(ledgerRef);
    if (ledgerSnapshot.exists) return true;

    const subscriptionAmount = await getSubscriptionAmount();
    const nextAutoDebitAt =
      purpose === 'trial'
        ? Timestamp.fromMillis(Date.now() + DAY_MS)
        : Timestamp.fromMillis(Date.now() + MONTH_MS);

    transaction.update(userRef, {
      razorpayTokenId: tokenId,
      mandateStatus: 'active',
      nextAutoDebitAt,
      nextAutoDebitAmount: subscriptionAmount.amount,
      graceUntil: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(ledgerRef, {
      userId: uid,
      purpose,
      razorpayPaymentId: paymentId,
      status: 'paid',
      createdAt: FieldValue.serverTimestamp(),
    });
    return false;
  });

  if (alreadyProcessed) return;

  if (purpose === 'trial') {
    await grantTrialCreditsOnce(uid);
  } else {
    // Direct-to-subscription registration (no trial) — the registration
    // payment itself was the subscription-amount charge, so credit it now.
    // Keyed by the plain paymentId (creditWallet's own convention), distinct
    // from the registration_ ledger doc written above.
    const rupeesPerCredit = await getRupeesPerCredit();
    await creditWallet(uid, (await getSubscriptionAmount()).amount, paymentId, 1 / rupeesPerCredit);
  }
}

export interface UpgradeNowResult {
  status: 'charged' | 'registration_required';
  creditsAwarded?: number;
  newBalance?: number;
  registrationLinkId?: string;
  shortUrl?: string;
}

/**
 * "Subscribe Rs.299 now" — whether tapped early (before the scheduled day-2
 * auto-debit) or with no mandate at all yet. If a mandate is already active,
 * cancels the pending schedule by charging immediately and restarting the
 * 30-day cycle from today. If there's no mandate, this instead starts
 * registration at the subscription amount directly (trial skipped).
 */
export async function upgradeNow(uid: string, method?: MandateMethod): Promise<UpgradeNowResult> {
  const user = await getUserOrThrow(uid);
  const subscriptionAmount = await getSubscriptionAmount();

  if (user.mandateStatus !== 'active' || !user.razorpayCustomerId || !user.razorpayTokenId) {
    if (!method) {
      throw new ValidationError('A payment method is required to set up auto-debit.');
    }
    const registration = await startRegistration(
      uid,
      method,
      subscriptionAmount.amount,
      'direct_subscription',
    );
    return { status: 'registration_required', ...registration };
  }

  const { paymentId } = await chargeRecurringToken(
    user.razorpayCustomerId,
    user.razorpayTokenId,
    subscriptionAmount.amount,
    `upgrade_${uid}_${Date.now()}`,
    user.phoneNumber,
    { uid, purpose: 'autodebit' },
  );

  const rupeesPerCredit = await getRupeesPerCredit();
  const result = await creditWallet(uid, subscriptionAmount.amount, paymentId, 1 / rupeesPerCredit);

  // Restart the 30-day cycle from today, regardless of whatever was pending.
  await adminFirestore()
    .collection('users')
    .doc(uid)
    .set(
      {
        nextAutoDebitAt: Timestamp.fromMillis(Date.now() + MONTH_MS),
        nextAutoDebitAmount: subscriptionAmount.amount,
        graceUntil: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  return { status: 'charged', creditsAwarded: result.creditsAwarded, newBalance: result.newBalance };
}

/**
 * Called by the scheduled job (functions/src/scheduled/processAutoDebits.ts).
 * Finds every user whose next auto-debit is due, charges their saved
 * mandate, credits the result, and advances the schedule — or, on failure,
 * starts a 3-day grace period without touching already-granted credits.
 */
export async function processDueAutoDebits(): Promise<{ charged: number; failed: number }> {
  const db = adminFirestore();
  const now = Timestamp.now();

  const dueSnapshot = await db
    .collection('users')
    .where('mandateStatus', '==', 'active')
    .where('nextAutoDebitAt', '<=', now)
    .get();

  let charged = 0;
  let failed = 0;

  for (const doc of dueSnapshot.docs) {
    const uid = doc.id;
    const user = doc.data() as UserProfileRecord;

    if (!user.razorpayCustomerId || !user.razorpayTokenId) {
      failed += 1;
      continue;
    }

    const amount = user.nextAutoDebitAmount ?? (await getSubscriptionAmount()).amount;

    try {
      const { paymentId } = await chargeRecurringToken(
        user.razorpayCustomerId,
        user.razorpayTokenId,
        amount,
        `autodebit_${uid}_${Date.now()}`,
        user.phoneNumber,
        { uid, purpose: 'autodebit' },
      );

      const rupeesPerCredit = await getRupeesPerCredit();
      await creditWallet(uid, amount, paymentId, 1 / rupeesPerCredit);

      await doc.ref.set(
        {
          nextAutoDebitAt: Timestamp.fromMillis(Date.now() + MONTH_MS),
          nextAutoDebitAmount: (await getSubscriptionAmount()).amount,
          graceUntil: FieldValue.delete(),
          lastPaymentFailureReason: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      charged += 1;
    } catch (error) {
      failed += 1;
      await doc.ref.set(
        {
          graceUntil: Timestamp.fromMillis(Date.now() + GRACE_PERIOD_MS),
          lastPaymentFailureReason: error instanceof Error ? error.message : 'Charge failed.',
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  }

  return { charged, failed };
}

/**
 * Downgrades any user whose grace period has elapsed without a successful
 * retry — stops future recurring, never claws back credits already granted.
 */
export async function downgradeExpiredGracePeriods(): Promise<number> {
  const db = adminFirestore();
  const now = Timestamp.now();

  const snapshot = await db
    .collection('users')
    .where('mandateStatus', '==', 'active')
    .where('graceUntil', '<=', now)
    .get();

  await Promise.all(
    snapshot.docs.map((doc) =>
      doc.ref.set(
        { mandateStatus: 'cancelled', updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      ),
    ),
  );

  return snapshot.size;
}
