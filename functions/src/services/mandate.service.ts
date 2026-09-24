import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';
import { getRupeesPerCredit, getSubscriptionAmount, getTrialAmount } from '../config/plans';
import {
  chargeRecurringToken,
  createRecurringOrder,
  createOrder,
  createRecurringRegistration,
  fetchMandateTokenStatus,
  fetchOrder,
  findMandateTokenId,
  verifyPaymentSignature,
  type CreatedOrder,
  type CreatedRecurringOrder,
  type VerifySignatureInput,
} from './razorpay.service';
import { creditWallet, getRemainingCredits } from './credits.service';
import { recordPaymentOrder } from './paymentOrders.service';
import { recordTransaction, type TransactionVia } from './transactions.service';
import { getUserProfile } from './userProfile.service';
import { NotFoundError, ValidationError } from '../utils/errors';
import type { MandateMethod, MandateStatus, SubscriptionCycleRecord, UserProfileRecord } from '../types';

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
 * Starts a new subscription "cycle" doc — subscriptions/{autoId}, one per
 * mandate-registration lifecycle (a trial registration, or a direct-to-
 * subscription registration), not one per user. This means a user who
 * cancels and later re-registers gets a fresh doc rather than having their
 * prior cycle's history overwritten in place. Points users/{uid}.subscriptionId
 * at the new doc so subsequent renewals/status updates land on the same
 * cycle — see updateCurrentSubscription.
 */
type SubscriptionCyclePatch = Partial<Omit<SubscriptionCycleRecord, 'userId' | 'createdAt' | 'updatedAt'>>;

async function startSubscriptionCycle(uid: string, patch: SubscriptionCyclePatch): Promise<string> {
  const db = adminFirestore();
  const ref = db.collection('subscriptions').doc();

  await ref.set({
    ...patch,
    userId: uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db
    .collection('users')
    .doc(uid)
    .set({ subscriptionId: ref.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  return ref.id;
}

/**
 * Updates the user's CURRENT subscription cycle (a renewal, a status change,
 * a failed-charge note, etc.) — never creates a new doc. Resolves the cycle
 * via users/{uid}.subscriptionId (set by startSubscriptionCycle); pass
 * `knownSubscriptionId` when the caller already has the user doc loaded, to
 * skip the extra read. Self-heals by starting a new cycle in the rare case a
 * user has none yet, rather than silently dropping the update.
 */
async function updateCurrentSubscription(
  uid: string,
  patch: SubscriptionCyclePatch,
  knownSubscriptionId?: string | null,
): Promise<void> {
  const db = adminFirestore();
  let subscriptionId = knownSubscriptionId;

  if (subscriptionId === undefined) {
    const userSnapshot = await db.collection('users').doc(uid).get();
    subscriptionId = (userSnapshot.data() as UserProfileRecord | undefined)?.subscriptionId ?? null;
  }

  if (!subscriptionId) {
    await startSubscriptionCycle(uid, patch);
    return;
  }

  await db
    .collection('subscriptions')
    .doc(subscriptionId)
    .set({ ...patch, userId: uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

async function getUserOrThrow(uid: string): Promise<UserProfileRecord> {
  const snapshot = await adminFirestore().collection('users').doc(uid).get();
  if (!snapshot.exists) throw new NotFoundError('User profile not found.');
  return snapshot.data() as UserProfileRecord;
}

/** The name shown on the Razorpay customer object — falls back when the user's name isn't set yet. */
async function getDisplayName(user: UserProfileRecord): Promise<string> {
  const profile = user.userProfileId ? await getUserProfile(user.userProfileId) : undefined;
  return profile?.name ?? 'Astro101 User';
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
    await getDisplayName(user),
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
      mandateStatus: 'created',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await startSubscriptionCycle(uid, {
    planId: purpose === 'trial' ? 'trial' : 'plus',
    status: 'created',
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
    await getDisplayName(user),
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
      mandateStatus: 'created',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await startSubscriptionCycle(uid, {
    planId: 'trial',
    status: 'created',
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
/**
 * Marks a registration 'authenticated': Razorpay has captured the payment
 * but hasn't confirmed the recurring token yet — a real, distinct state from
 * "never paid" (previously invisible; both looked like plain 'created').
 * Shared by the client-verify paths below and the payment.captured webhook
 * handler, for the same reason completeMandateRegistration is shared by all
 * three: the token can show up via any of them.
 */
export async function markAuthenticated(
  uid: string,
  knownSubscriptionId?: string | null,
): Promise<void> {
  await updateCurrentSubscription(uid, { status: 'authenticated' }, knownSubscriptionId);
  await adminFirestore().collection('users').doc(uid).set(
    { mandateStatus: 'authenticated', updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

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
  if (!tokenId) {
    // The webhook finishes this once token.confirmed or a later
    // payment.captured (with token_id) arrives.
    await markAuthenticated(uid, user.subscriptionId ?? null);
    return { status: 'pending' };
  }

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
    await getDisplayName(user),
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
      mandateStatus: 'created',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await startSubscriptionCycle(uid, {
    planId: 'plus',
    status: 'created',
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
    if (!tokenId) {
      await markAuthenticated(uid, user.subscriptionId ?? null);
      return { status: 'pending' };
    }
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
    await updateCurrentSubscription(uid, {
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
      // -> transactions/{id}; the synthetic token_ id never becomes a transaction.
      transactionId: paymentId.startsWith('token_') ? null : paymentId,
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
  // This registration was kicked off by startSubscriptionCycle (via
  // startRegistration/startTrialOrder/startSubscriptionOrder), which already
  // pointed users/{uid}.subscriptionId at the cycle doc — updateCurrentSubscription
  // completes that same doc rather than starting a new one.
  await updateCurrentSubscription(uid, {
    // planId already distinguishes trial from paid — see the MandateStatus
    // doc comment in types/index.ts for why 'active' covers both rather than
    // a separate 'trialing' status.
    planId: purpose === 'trial' ? 'trial' : 'plus',
    status: 'active',
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
  // Set when Razorpay charged the user successfully but crediting their
  // wallet then failed (see finalizeAutoDebitCharge) — the app must NOT
  // treat this as a failed payment (retrying would charge the user again);
  // it's queued for manual reconciliation instead.
  creditingPending?: boolean;
}

interface FinalizedCharge {
  creditsAwarded: number;
  newBalance: number;
  bookkeepingFailed: boolean;
}

/**
 * Runs after chargeRecurringToken has ALREADY succeeded — Razorpay has taken
 * the money by the time this is called. Advances the auto-debit schedule
 * FIRST, before any bookkeeping that could fail, so a crash here can never
 * cause processDueAutoDebits to charge this user a second time for the same
 * cycle. Credits/records/updates the subscription cycle as one best-effort
 * unit; if any of that throws, the failure is durably recorded to
 * failedCredits/{paymentId} for manual reconciliation instead of being
 * silently lost or — worse — mistaken for a failed charge (which would
 * wrongly open a grace period against a user who already paid). Safe to
 * re-run by hand later: creditWallet/recordTransaction are both idempotent
 * per paymentId.
 */
async function finalizeAutoDebitCharge(
  uid: string,
  user: UserProfileRecord,
  paymentId: string,
  orderId: string,
  amountRupees: number,
): Promise<FinalizedCharge> {
  const nextAutoDebitAmount = (await getSubscriptionAmount()).amount;
  const nextAutoDebitAt = Timestamp.fromMillis(Date.now() + MONTH_MS);

  await adminFirestore().collection('users').doc(uid).set(
    {
      nextAutoDebitAt,
      nextAutoDebitAmount,
      graceUntil: FieldValue.delete(),
      lastPaymentFailureReason: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  try {
    const rupeesPerCredit = await getRupeesPerCredit();
    const credited = await creditWallet(uid, amountRupees, paymentId, 1 / rupeesPerCredit, 'subscription');
    await recordTransaction({
      uid,
      paymentId,
      orderId,
      purpose: 'autodebit',
      status: 'paid',
      amountRupees,
      creditsAwarded: credited.creditsAwarded,
      paymentMethod: user.mandateMethod,
      via: 'auto_debit',
    });
    await updateCurrentSubscription(
      uid,
      {
        planId: 'plus',
        status: 'active',
        lastPaymentId: paymentId,
        lastPaymentAmount: amountRupees,
        lastPaymentAt: Timestamp.now(),
        currentPeriodStart: Timestamp.now(),
        nextAutoDebitAt,
        nextAutoDebitAmount,
      },
      user.subscriptionId ?? null,
    );
    return { creditsAwarded: credited.creditsAwarded, newBalance: credited.newBalance, bookkeepingFailed: false };
  } catch (error) {
    console.error(
      `[mandate] CRITICAL: charged ${uid} Rs.${amountRupees} (payment ${paymentId}) but crediting failed — needs manual reconciliation`,
      error,
    );
    await adminFirestore()
      .collection('failedCredits')
      .doc(paymentId)
      .set(
        {
          userId: uid,
          paymentId,
          orderId,
          purpose: 'autodebit',
          amountRupees,
          reason: error instanceof Error ? error.message : 'Unknown error crediting after charge.',
          resolved: false,
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      .catch((writeError) => {
        console.error(`[mandate] Also failed to record failedCredits/${paymentId}`, writeError);
      });
    return { creditsAwarded: 0, newBalance: (await getRemainingCredits(uid)) ?? 0, bookkeepingFailed: true };
  }
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

  // From here, chargeRecurringToken either throws (a genuine charge failure —
  // propagates as before, nothing charged) or succeeds (Razorpay has taken
  // the money). Everything after a successful charge is handled by
  // finalizeAutoDebitCharge, which can never turn a bookkeeping hiccup into
  // a second real charge or a wrongly-opened grace period.
  const { paymentId, orderId } = await chargeRecurringToken(
    user.razorpayCustomerId,
    user.razorpayTokenId,
    subscriptionAmount.amount,
    `upgrade_${uid}_${Date.now()}`,
    user.phoneNumber,
    { uid, purpose: 'autodebit' },
  );

  const result = await finalizeAutoDebitCharge(uid, user, paymentId, orderId, subscriptionAmount.amount);

  return {
    status: 'charged',
    creditsAwarded: result.creditsAwarded,
    newBalance: result.newBalance,
    creditingPending: result.bookkeepingFailed || undefined,
  };
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

    // Only a failure of the charge itself (declined, etc.) belongs in this
    // try/catch — it's the only case that should ever open a grace period.
    // Once chargeRecurringToken returns, Razorpay has already taken the
    // money; everything after that is finalizeAutoDebitCharge's job, and its
    // own failures must never be treated as a failed charge (see its doc
    // comment) or this catch block would wrongly grace-period a user who
    // already paid, and leave nextAutoDebitAt unmoved — risking a real
    // second charge on the next hourly run.
    let charge: { paymentId: string; orderId: string };
    try {
      charge = await chargeRecurringToken(
        user.razorpayCustomerId,
        user.razorpayTokenId,
        amount,
        `autodebit_${uid}_${Date.now()}`,
        user.phoneNumber,
        { uid, purpose: 'autodebit' },
      );
    } catch (error) {
      failed += 1;
      await updateCurrentSubscription(
        uid,
        {
          status: 'past_due',
          lastPaymentFailureReason: error instanceof Error ? error.message : 'Charge failed.',
        },
        user.subscriptionId ?? null,
      ).catch(() => undefined);
      await doc.ref.set(
        {
          graceUntil: Timestamp.fromMillis(Date.now() + GRACE_PERIOD_MS),
          lastPaymentFailureReason: error instanceof Error ? error.message : 'Charge failed.',
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      continue;
    }

    const result = await finalizeAutoDebitCharge(uid, user, charge.paymentId, charge.orderId, amount);
    if (result.bookkeepingFailed) {
      failed += 1;
    } else {
      charged += 1;
    }
  }

  return { charged, failed };
}

/**
 * Asks Razorpay directly whether the user's saved mandate token is still
 * chargeable, and self-corrects local state if it isn't — rather than
 * relying solely on the next scheduled auto-debit attempt to fail and
 * discover that reactively. Called from reconcile.service.ts's
 * reconcilePayments, which the app already invokes on every foreground.
 * A no-op (and cheap) for any user not currently 'active'/'past_due', or
 * with no token to check yet.
 */
export async function reconcileMandateStatus(uid: string): Promise<MandateStatus> {
  const user = await getUserOrThrow(uid);
  const current = user.mandateStatus ?? 'none';

  if (
    (current !== 'active' && current !== 'past_due') ||
    !user.razorpayCustomerId ||
    !user.razorpayTokenId
  ) {
    return current;
  }

  const tokenStatus = await fetchMandateTokenStatus(user.razorpayCustomerId, user.razorpayTokenId);
  // A failed/unavailable check is not evidence of anything — never downgrade
  // a user's access because Razorpay's API was briefly unreachable.
  if (!tokenStatus || tokenStatus.isLive) return current;

  await adminFirestore().collection('users').doc(uid).set(
    {
      mandateStatus: 'cancelled',
      lastPaymentFailureReason: tokenStatus.failureReason ?? 'Mandate no longer active at Razorpay.',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await updateCurrentSubscription(
    uid,
    {
      status: 'cancelled',
      lastPaymentFailureReason: tokenStatus.failureReason ?? 'Mandate no longer active at Razorpay.',
    },
    user.subscriptionId ?? null,
  );

  return 'cancelled';
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
      const user = doc.data() as UserProfileRecord;
      await doc.ref.set(
        { mandateStatus: 'cancelled', updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      await updateCurrentSubscription(doc.id, { status: 'cancelled' }, user.subscriptionId ?? null);
    }),
  );

  return snapshot.size;
}
