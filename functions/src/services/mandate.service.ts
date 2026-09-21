import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';
import { getRupeesPerCredit, getSubscriptionAmount, getTrialAmount } from '../config/plans';
import {
  chargeRecurringToken,
  createRecurringOrder,
  createOrder,
  createRecurringRegistration,
  fetchOrder,
  findMandateTokenId,
  verifyPaymentSignature,
  type CreatedOrder,
  type CreatedRecurringOrder,
  type VerifySignatureInput,
} from './razorpay.service';
import { creditWallet } from './credits.service';
import { recordPaymentOrder } from './paymentOrders.service';
import { recordTransaction, type TransactionVia } from './transactions.service';
import { NotFoundError, ValidationError } from '../utils/errors';
import type { MandateMethod, UserProfileRecord } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;
const GRACE_PERIOD_MS = 3 * DAY_MS;

/** Where a payment was confirmed from; when omitted, no transactions/ record is written. */
export interface TransactionOptions {
  via: TransactionVia;
  orderId?: string | null;
  paymentMethod?: string | null;
}

/**
 * Keeps subscriptions/{uid} — the per-user subscription record — in step with
 * the mandate state on users/{uid}. Individual charges are logged in
 * `payments` (creditWallet); this doc holds the current plan state.
 */
async function recordSubscription(uid: string, patch: Record<string, unknown>): Promise<void> {
  await adminFirestore()
    .collection('subscriptions')
    .doc(uid)
    .set({ ...patch, userId: uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

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

  await recordSubscription(uid, {
    planId: purpose === 'trial' ? 'trial' : 'plus',
    status: 'pending',
    mandateMethod: method,
    razorpayCustomerId: registration.customerId,
    registrationAmount: amountRupees,
  });

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
 * Same as startTrial, but returns a Razorpay order for the in-app native
 * Checkout SDK instead of a hosted registration-link URL. Mandate + trial
 * credits are still granted only by the webhook.
 */
export async function startTrialOrder(
  uid: string,
  method: MandateMethod,
): Promise<CreatedRecurringOrder> {
  const user = await getUserOrThrow(uid);
  const trial = await getTrialAmount();

  const order = await createRecurringOrder(
    user.name ?? 'Astro101 User',
    `${uid}@users.astro101.app`,
    user.phoneNumber,
    trial.amount,
    method,
    `trial_${uid}_${Date.now()}`,
    { uid, purpose: 'trial' },
    user.razorpayCustomerId,
  );
  await recordPaymentOrder(order.orderId, uid, 'trial', order.amount);

  await adminFirestore().collection('users').doc(uid).set(
    {
      razorpayCustomerId: order.customerId,
      mandateMethod: method,
      mandateStatus: 'pending',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await recordSubscription(uid, {
    planId: 'trial',
    status: 'pending',
    mandateMethod: method,
    razorpayCustomerId: order.customerId,
    registrationAmount: trial.amount,
  });

  return order;
}

/**
 * Synchronous confirmation right after the in-app checkout succeeds, so the
 * app doesn't depend solely on the webhook. Verifies the checkout signature
 * and order ownership, then runs the same idempotent completion the webhook
 * uses. Returns 'pending' if Razorpay hasn't issued the mandate token yet
 * (the webhook will finish it).
 */
export async function verifyTrialRegistration(
  uid: string,
  input: VerifySignatureInput,
): Promise<{ status: 'ok' | 'pending' }> {
  verifyPaymentSignature(input);

  const order = await fetchOrder(input.orderId);
  const notes = order.notes as Record<string, string> | undefined;
  if (notes?.uid !== uid || notes?.purpose !== 'trial') {
    throw new ValidationError('This order does not belong to a trial for this account.');
  }

  const user = await getUserOrThrow(uid);
  const tokenId = await findMandateTokenId(input.paymentId, user.razorpayCustomerId);
  if (!tokenId) return { status: 'pending' };

  await completeMandateRegistration(uid, tokenId, input.paymentId, 'trial', {
    via: 'client_verify',
    orderId: input.orderId,
  });
  return { status: 'ok' };
}

export interface SubscriptionOrder extends CreatedOrder {
  // Set when this order also registers an auto-debit mandate (no active one yet).
  customerId?: string;
}

/**
 * "Subscribe Rs.299" through the in-app Razorpay Checkout — the user always
 * completes a real payment; credits are only granted by verifySubscription-
 * Payment (or the webhook) after Razorpay confirms it. With an active mandate
 * this is a plain one-time order (the existing auto-debit cycle restarts once
 * paid); without one, it is a recurring-enabled order that also registers the
 * mandate at the subscription amount.
 */
export async function startSubscriptionOrder(
  uid: string,
  method?: MandateMethod,
): Promise<SubscriptionOrder> {
  const user = await getUserOrThrow(uid);
  const { amount, currency } = await getSubscriptionAmount();
  const hasActiveMandate =
    user.mandateStatus === 'active' && !!user.razorpayCustomerId && !!user.razorpayTokenId;

  if (hasActiveMandate) {
    const plainOrder = await createOrder(amount, currency, `subscription_${uid}_${Date.now()}`, {
      uid,
      purpose: 'subscription',
    });
    await recordPaymentOrder(plainOrder.orderId, uid, 'subscription', plainOrder.amount);
    return plainOrder;
  }

  if (!method) {
    throw new ValidationError('A payment method is required to set up auto-debit.');
  }

  const order = await createRecurringOrder(
    user.name ?? 'Astro101 User',
    `${uid}@users.astro101.app`,
    user.phoneNumber,
    amount,
    method,
    `subscription_${uid}_${Date.now()}`,
    { uid, purpose: 'direct_subscription' },
    user.razorpayCustomerId,
  );
  await recordPaymentOrder(order.orderId, uid, 'direct_subscription', order.amount);

  await adminFirestore().collection('users').doc(uid).set(
    {
      razorpayCustomerId: order.customerId,
      mandateMethod: method,
      mandateStatus: 'pending',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await recordSubscription(uid, {
    planId: 'plus',
    status: 'pending',
    mandateMethod: method,
    razorpayCustomerId: order.customerId,
    registrationAmount: amount,
  });

  return order;
}

/**
 * Confirms a paid subscription order (signature + ownership checked), then
 * credits the wallet — idempotent per paymentId, so a retry or the webhook
 * can't double-credit. Returns 'pending' only for the mandate-registering
 * variant when Razorpay hasn't issued the token yet (the webhook finishes it).
 */
export async function verifySubscriptionPayment(
  uid: string,
  input: VerifySignatureInput,
): Promise<{ status: 'ok' | 'pending' }> {
  verifyPaymentSignature(input);

  const order = await fetchOrder(input.orderId);
  const notes = order.notes as Record<string, string> | undefined;
  const purpose = notes?.purpose;
  if (notes?.uid !== uid || (purpose !== 'subscription' && purpose !== 'direct_subscription')) {
    throw new ValidationError('This order does not belong to a subscription for this account.');
  }

  if (purpose === 'direct_subscription') {
    const user = await getUserOrThrow(uid);
    const tokenId = await findMandateTokenId(input.paymentId, user.razorpayCustomerId);
    if (!tokenId) return { status: 'pending' };
    await completeMandateRegistration(uid, tokenId, input.paymentId, 'direct_subscription', {
      via: 'client_verify',
      orderId: input.orderId,
    });
    return { status: 'ok' };
  }

  await applySubscriptionPayment(uid, input.paymentId, {
    via: 'client_verify',
    orderId: input.orderId,
  });
  return { status: 'ok' };
}

/**
 * Credits a paid one-time subscription order and restarts the 30-day cycle.
 * Idempotent per paymentId (creditWallet), so the client verify, the webhook
 * and reconciliation can all call it for the same payment.
 */
export async function applySubscriptionPayment(
  uid: string,
  paymentId: string,
  options?: TransactionOptions,
): Promise<void> {
  const { amount } = await getSubscriptionAmount();
  const rupeesPerCredit = await getRupeesPerCredit();
  const result = await creditWallet(uid, amount, paymentId, 1 / rupeesPerCredit, 'subscription');

  if (!result.alreadyProcessed) {
    const nextAutoDebitAt = Timestamp.fromMillis(Date.now() + MONTH_MS);
    await adminFirestore().collection('users').doc(uid).set(
      {
        nextAutoDebitAt,
        nextAutoDebitAmount: amount,
        graceUntil: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    await recordSubscription(uid, {
      planId: 'plus',
      status: 'active',
      lastPaymentId: paymentId,
      lastPaymentAmount: amount,
      lastPaymentAt: Timestamp.now(),
      currentPeriodStart: Timestamp.now(),
      nextAutoDebitAt,
      nextAutoDebitAmount: amount,
    });
  }

  if (options) {
    await recordTransaction({
      uid,
      paymentId,
      orderId: options.orderId,
      purpose: 'subscription',
      status: 'paid',
      amountRupees: amount,
      creditsAwarded: result.creditsAwarded,
      paymentMethod: options.paymentMethod,
      via: options.via,
    });
  }
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
  options?: TransactionOptions,
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

  // The token.confirmed webhook passes a synthetic `token_<id>` as paymentId —
  // not a real Razorpay payment, so it never becomes a transaction.
  const recordable = options && !paymentId.startsWith('token_') ? options : undefined;

  if (alreadyProcessed) {
    // Still note this channel on the existing transaction (confirmedVia).
    if (recordable) {
      await recordRegistrationTransaction(uid, paymentId, purpose, recordable, undefined);
    }
    return;
  }

  const subscriptionAmount = await getSubscriptionAmount();
  await recordSubscription(uid, {
    planId: purpose === 'trial' ? 'trial' : 'plus',
    status: purpose === 'trial' ? 'trialing' : 'active',
    razorpayTokenId: tokenId,
    lastPaymentId: paymentId,
    currentPeriodStart: Timestamp.now(),
    nextAutoDebitAt: Timestamp.fromMillis(
      Date.now() + (purpose === 'trial' ? DAY_MS : MONTH_MS),
    ),
    nextAutoDebitAmount: subscriptionAmount.amount,
  });

  if (purpose === 'trial') {
    await grantTrialCreditsOnce(uid);
    if (recordable) {
      await recordRegistrationTransaction(uid, paymentId, purpose, recordable, 5);
    }
  } else {
    // Direct-to-subscription registration (no trial) — the registration
    // payment itself was the subscription-amount charge, so credit it now.
    // Keyed by the plain paymentId (creditWallet's own convention), distinct
    // from the registration_ ledger doc written above.
    const rupeesPerCredit = await getRupeesPerCredit();
    const credited = await creditWallet(
      uid,
      subscriptionAmount.amount,
      paymentId,
      1 / rupeesPerCredit,
      'subscription',
    );
    if (recordable) {
      await recordRegistrationTransaction(
        uid,
        paymentId,
        purpose,
        recordable,
        credited.creditsAwarded,
      );
    }
  }
}

async function recordRegistrationTransaction(
  uid: string,
  paymentId: string,
  purpose: 'trial' | 'direct_subscription',
  options: TransactionOptions,
  creditsAwarded: number | undefined,
): Promise<void> {
  const amount =
    purpose === 'trial' ? (await getTrialAmount()).amount : (await getSubscriptionAmount()).amount;
  await recordTransaction({
    uid,
    paymentId,
    orderId: options.orderId,
    purpose,
    status: 'paid',
    amountRupees: amount,
    creditsAwarded,
    paymentMethod: options.paymentMethod,
    via: options.via,
  });
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

  const { paymentId, orderId } = await chargeRecurringToken(
    user.razorpayCustomerId,
    user.razorpayTokenId,
    subscriptionAmount.amount,
    `upgrade_${uid}_${Date.now()}`,
    user.phoneNumber,
    { uid, purpose: 'autodebit' },
  );

  const rupeesPerCredit = await getRupeesPerCredit();
  const result = await creditWallet(
    uid,
    subscriptionAmount.amount,
    paymentId,
    1 / rupeesPerCredit,
    'subscription',
  );
  await recordTransaction({
    uid,
    paymentId,
    orderId,
    purpose: 'subscription',
    status: 'paid',
    amountRupees: subscriptionAmount.amount,
    creditsAwarded: result.creditsAwarded,
    paymentMethod: user.mandateMethod,
    via: 'auto_debit',
  });
  await recordSubscription(uid, {
    planId: 'plus',
    status: 'active',
    lastPaymentId: paymentId,
    lastPaymentAmount: subscriptionAmount.amount,
    lastPaymentAt: Timestamp.now(),
    currentPeriodStart: Timestamp.now(),
    nextAutoDebitAt: Timestamp.fromMillis(Date.now() + MONTH_MS),
    nextAutoDebitAmount: subscriptionAmount.amount,
  });

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
      const { paymentId, orderId } = await chargeRecurringToken(
        user.razorpayCustomerId,
        user.razorpayTokenId,
        amount,
        `autodebit_${uid}_${Date.now()}`,
        user.phoneNumber,
        { uid, purpose: 'autodebit' },
      );

      const rupeesPerCredit = await getRupeesPerCredit();
      const credited = await creditWallet(uid, amount, paymentId, 1 / rupeesPerCredit, 'subscription');
      await recordTransaction({
        uid,
        paymentId,
        orderId,
        purpose: 'autodebit',
        status: 'paid',
        amountRupees: amount,
        creditsAwarded: credited.creditsAwarded,
        paymentMethod: user.mandateMethod,
        via: 'auto_debit',
      });
      await recordSubscription(uid, {
        planId: 'plus',
        status: 'active',
        lastPaymentId: paymentId,
        lastPaymentAmount: amount,
        lastPaymentAt: Timestamp.now(),
        currentPeriodStart: Timestamp.now(),
        nextAutoDebitAt: Timestamp.fromMillis(Date.now() + MONTH_MS),
        nextAutoDebitAmount: (await getSubscriptionAmount()).amount,
      });

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
      await recordSubscription(uid, {
        status: 'past_due',
        lastPaymentFailureReason: error instanceof Error ? error.message : 'Charge failed.',
      }).catch(() => undefined);
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
    snapshot.docs.map(async (doc) => {
      await doc.ref.set(
        { mandateStatus: 'cancelled', updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      await recordSubscription(doc.id, { status: 'cancelled' });
    }),
  );

  return snapshot.size;
}
