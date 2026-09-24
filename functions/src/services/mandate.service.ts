import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';
import { getRupeesPerCredit, getSubscriptionAmount, getSubscriptionPlanId, getTrialAmount } from '../config/plans';
import {
  cancelSubscription as cancelRazorpaySubscription,
  createRecurringSubscription,
  fetchSubscription,
  fetchSubscriptionPayments,
  verifySubscriptionPaymentSignature,
  type VerifySubscriptionSignatureInput,
} from './razorpay.service';
import { creditWallet } from './credits.service';
import { recordTransaction, type TransactionVia } from './transactions.service';
import { NotFoundError, ValidationError } from '../utils/errors';
import type { MandateMethod, MandateStatus, SubscriptionCycleRecord, UserProfileRecord } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Where a payment was confirmed from; when omitted, no transactions/ record is written. */
export interface TransactionOptions {
  via: TransactionVia;
  orderId?: string | null;
  paymentMethod?: string | null;
}

type SubscriptionCyclePatch = Partial<Omit<SubscriptionCycleRecord, 'userId' | 'createdAt' | 'updatedAt'>>;

/**
 * Generated-id fallback for starting a cycle without a Razorpay subscription
 * id in hand — used only by updateCurrentSubscription's self-heal path
 * below (a defensive case that shouldn't normally trigger, since every real
 * registration goes through startSubscriptionCycleFromRazorpay instead,
 * which always has the real id by the time a cycle needs to exist).
 */
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
 * Starts a new subscription "cycle" doc — subscriptions/{razorpaySubscriptionId},
 * one per mandate-registration lifecycle, not one per user, so a user who
 * cancels and later re-registers gets a fresh doc rather than having their
 * prior cycle's history overwritten. The doc id IS the real Razorpay
 * subscription id (fetched from Razorpay's own response, not generated
 * locally) — see the MandateStatus doc comment in types/index.ts. Points
 * users/{uid}.subscriptionId at the new doc so subsequent renewals/status
 * updates land on the same cycle — see updateCurrentSubscription.
 */
async function startSubscriptionCycleFromRazorpay(
  uid: string,
  razorpaySubscriptionId: string,
  patch: SubscriptionCyclePatch,
): Promise<void> {
  const db = adminFirestore();

  await db
    .collection('subscriptions')
    .doc(razorpaySubscriptionId)
    .set({
      ...patch,
      userId: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  await db
    .collection('users')
    .doc(uid)
    .set({ subscriptionId: razorpaySubscriptionId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

/**
 * Updates the user's CURRENT subscription cycle (a renewal, a status change,
 * etc.) — never creates a new doc. Resolves the cycle via
 * users/{uid}.subscriptionId; pass `knownSubscriptionId` when the caller
 * already has the user doc loaded, to skip the extra read. Self-heals by
 * starting a new (generated-id) cycle in the rare case a user has none yet,
 * rather than silently dropping the update.
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

/**
 * Grants the one-time 5-credit trial gift, idempotent per user forever (not
 * just per payment) — keyed by a fixed ledger doc id so even a retried
 * completion call can't grant it twice, on top of the trialCreditsClaimed
 * flag fast-path check. (account.controller.ts's deleteAccount also deletes
 * this ledger doc, so a deleted-and-recreated account isn't wrongly blocked
 * from ever claiming the gift again.)
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

export interface NewMandateSubscription {
  subscriptionId: string;
  shortUrl: string;
  status: string;
  keyId: string;
}

const SUBSCRIPTION_TOTAL_COUNT = 120; // ~10 years of monthly cycles.

/**
 * Starts a brand-new mandate via Razorpay's Subscriptions API — Razorpay
 * itself owns the billing schedule and retries entirely from here on. Used
 * for both the Rs.1 trial (`trial` — an addon charge now, the real plan
 * delayed via start_at) and skipping the trial entirely (`direct_subscription`
 * — the plan bills immediately).
 */
async function startNewMandateSubscription(
  uid: string,
  method: MandateMethod,
  purpose: 'trial' | 'direct_subscription',
): Promise<NewMandateSubscription> {
  const planId = await getSubscriptionPlanId();
  const subscriptionAmount = await getSubscriptionAmount();
  const trial = purpose === 'trial' ? await getTrialAmount() : null;

  const subscription = await createRecurringSubscription(
    planId,
    SUBSCRIPTION_TOTAL_COUNT,
    { uid, purpose },
    trial
      ? {
          startAtSeconds: Math.floor((Date.now() + DAY_MS) / 1000),
          addonAmountRupees: trial.amount,
          addonName: 'Astro101 Trial',
        }
      : undefined,
  );

  await startSubscriptionCycleFromRazorpay(uid, subscription.subscriptionId, {
    planId: purpose === 'trial' ? 'trial' : 'plus',
    status: subscription.status as MandateStatus,
    razorpayStatus: subscription.status,
    mandateMethod: method,
    registrationAmount: trial ? trial.amount : subscriptionAmount.amount,
  });

  await adminFirestore().collection('users').doc(uid).set(
    {
      mandateMethod: method,
      mandateStatus: subscription.status,
      razorpayStatus: subscription.status,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return subscription;
}

export interface StartRegistrationResult {
  subscriptionId: string;
  shortUrl: string;
}

/**
 * Hosted-checkout-page variant of the Rs.1 trial (POST /payments/trial/start
 * — not currently called by any app screen, which uses startTrialOrder's
 * native in-app checkout instead, but the route is still live).
 */
export async function startTrial(
  uid: string,
  method: MandateMethod,
): Promise<StartRegistrationResult> {
  const subscription = await startNewMandateSubscription(uid, method, 'trial');
  return { subscriptionId: subscription.subscriptionId, shortUrl: subscription.shortUrl };
}

export async function startTrialOrder(uid: string, method: MandateMethod): Promise<NewMandateSubscription> {
  return startNewMandateSubscription(uid, method, 'trial');
}

/**
 * Synchronous confirmation right after the in-app checkout succeeds, so the
 * app doesn't depend solely on the webhook. Verifies the subscription
 * checkout signature, fetches live status from Razorpay, and credits if
 * already entitled; otherwise the webhook (subscription.authenticated/charged)
 * finishes it.
 */
export async function verifyTrialRegistration(
  uid: string,
  input: VerifySubscriptionSignatureInput,
): Promise<{ status: 'ok' | 'pending' }> {
  return verifyNewMandateCheckout(uid, input);
}

/**
 * "Subscribe Rs.299" through the in-app Razorpay Checkout. Throws if the
 * user already has an active mandate (the paywall gate already hides this
 * flow in that case; this guards the API directly too, rather than silently
 * starting a duplicate subscription).
 */
export async function startSubscriptionOrder(
  uid: string,
  method?: MandateMethod,
): Promise<NewMandateSubscription> {
  const user = await getUserOrThrow(uid);

  if (user.mandateStatus === 'active') {
    throw new ValidationError('You already have an active subscription.');
  }
  if (!method) {
    throw new ValidationError('A payment method is required to set up auto-debit.');
  }

  return startNewMandateSubscription(uid, method, 'direct_subscription');
}

/** Confirms a paid direct-to-subscription registration (no trial). */
export async function verifyDirectSubscriptionRegistration(
  uid: string,
  input: VerifySubscriptionSignatureInput,
): Promise<{ status: 'ok' | 'pending' }> {
  return verifyNewMandateCheckout(uid, input);
}

const ENTITLED_SUBSCRIPTION_STATUSES = new Set(['authenticated', 'active', 'completed']);

/**
 * Confirms a Subscriptions-API checkout right after it succeeds client-side —
 * the webhook (subscription.authenticated/charged) remains the source of
 * truth/fallback. Verifies the subscription-flavored signature (different
 * formula from an order's — see razorpay.service.ts), fetches live status
 * from Razorpay, and credits if already entitled; otherwise leaves it to the
 * webhook and returns 'pending'.
 */
async function verifyNewMandateCheckout(
  uid: string,
  input: VerifySubscriptionSignatureInput,
): Promise<{ status: 'ok' | 'pending' }> {
  verifySubscriptionPaymentSignature(input);

  const cycleSnapshot = await adminFirestore().collection('subscriptions').doc(input.subscriptionId).get();
  if (!cycleSnapshot.exists || cycleSnapshot.data()?.userId !== uid) {
    throw new ValidationError('This subscription does not belong to this account.');
  }

  const subscription = await fetchSubscription(input.subscriptionId);

  if (!ENTITLED_SUBSCRIPTION_STATUSES.has(subscription.status)) {
    await updateNewMandateStatus(uid, input.subscriptionId, subscription.status as MandateStatus, subscription.status);
    return { status: 'pending' };
  }

  await applyNewMandateEntitlement(uid, input.subscriptionId, input.paymentId, subscription.status, {
    via: 'client_verify',
  });
  return { status: 'ok' };
}

/**
 * Status-only sync (no crediting) — lifecycle events like
 * activated/pending/halted/cancelled/completed. `status` is our own
 * entitlement-view MandateStatus (see UserProfileRecord.mandateStatus);
 * `razorpayStatus` is Razorpay's own subscription.status verbatim, kept
 * alongside it purely for visibility — see UserProfileRecord.razorpayStatus.
 */
export async function updateNewMandateStatus(
  uid: string,
  subscriptionId: string,
  status: MandateStatus,
  razorpayStatus: string,
): Promise<void> {
  await updateCurrentSubscription(uid, { status, razorpayStatus }, subscriptionId);
  await adminFirestore().collection('users').doc(uid).set(
    { mandateStatus: status, razorpayStatus, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

/**
 * Credits the wallet the FIRST time a mandate becomes entitled — the
 * trial's addon charge, or a direct subscription's first charge. Idempotent
 * per paymentId (creditWallet for direct; grantTrialCreditsOnce's own
 * per-user ledger for trial), so the client verify, the webhook, and a live
 * status poll can all call this safely for the same event. Renewals
 * (subscription.charged on an already-active cycle) go through
 * applyNewMandateRenewal instead — this function always sets status 'active'.
 */
export async function applyNewMandateEntitlement(
  uid: string,
  subscriptionId: string,
  paymentId: string,
  razorpayStatus: string,
  options: TransactionOptions,
): Promise<void> {
  const cycleSnapshot = await adminFirestore().collection('subscriptions').doc(subscriptionId).get();
  const cycle = cycleSnapshot.data() as SubscriptionCycleRecord | undefined;
  const isTrial = cycle?.planId === 'trial';

  let creditsAwarded: number | undefined;
  if (isTrial) {
    await grantTrialCreditsOnce(uid);
    creditsAwarded = 5;
  } else {
    const subscriptionAmount = await getSubscriptionAmount();
    const rupeesPerCredit = await getRupeesPerCredit();
    const result = await creditWallet(uid, subscriptionAmount.amount, paymentId, 1 / rupeesPerCredit, 'subscription');
    creditsAwarded = result.creditsAwarded;
  }

  await updateCurrentSubscription(
    uid,
    { status: 'active', razorpayStatus, lastPaymentId: paymentId, currentPeriodStart: Timestamp.now() },
    subscriptionId,
  );
  await adminFirestore().collection('users').doc(uid).set(
    {
      mandateStatus: 'active',
      razorpayStatus,
      subscriptionActivatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const amountRupees = isTrial ? (await getTrialAmount()).amount : (await getSubscriptionAmount()).amount;
  await recordTransaction({
    uid,
    paymentId,
    purpose: isTrial ? 'trial' : 'direct_subscription',
    status: 'paid',
    amountRupees,
    creditsAwarded,
    paymentMethod: options.paymentMethod,
    via: options.via,
  });
}

/**
 * Credits a renewal charge on an already-entitled mandate —
 * subscription.charged with paid_count > 1 (or the first non-trial charge,
 * which applyNewMandateEntitlement already handles — recordTransaction's own
 * idempotency-by-paymentId means calling this for that same payment too,
 * from the webhook, is harmless). Idempotent per paymentId via creditWallet.
 */
export async function applyNewMandateRenewal(
  uid: string,
  subscriptionId: string,
  paymentId: string,
  razorpayStatus: string,
): Promise<void> {
  const subscriptionAmount = await getSubscriptionAmount();
  const rupeesPerCredit = await getRupeesPerCredit();
  const result = await creditWallet(uid, subscriptionAmount.amount, paymentId, 1 / rupeesPerCredit, 'subscription');

  await updateCurrentSubscription(
    uid,
    {
      planId: 'plus',
      status: 'active',
      razorpayStatus,
      lastPaymentId: paymentId,
      lastPaymentAmount: subscriptionAmount.amount,
      lastPaymentAt: Timestamp.now(),
      currentPeriodStart: Timestamp.now(),
    },
    subscriptionId,
  );
  await adminFirestore().collection('users').doc(uid).set(
    { razorpayStatus, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  await recordTransaction({
    uid,
    paymentId,
    purpose: 'subscription',
    status: 'paid',
    amountRupees: subscriptionAmount.amount,
    creditsAwarded: result.creditsAwarded,
    via: 'webhook',
  });
}

/**
 * Live-checks a mandate directly against Razorpay and syncs local state —
 * self-healing counterpart to the webhook, for when it's missed. Credits the
 * entitlement if Razorpay reports it captured but local state hasn't caught
 * up. Safe to call repeatedly.
 */
export async function checkNewMandateStatus(uid: string, subscriptionId: string): Promise<MandateStatus> {
  const cycleSnapshot = await adminFirestore().collection('subscriptions').doc(subscriptionId).get();
  if (!cycleSnapshot.exists || cycleSnapshot.data()?.userId !== uid) {
    throw new ValidationError('This subscription does not belong to this account.');
  }
  const cycle = cycleSnapshot.data() as SubscriptionCycleRecord;

  const subscription = await fetchSubscription(subscriptionId);
  const entitled = ENTITLED_SUBSCRIPTION_STATUSES.has(subscription.status);
  const alreadyEntitled = cycle.status === 'active' || cycle.status === 'completed';

  if (entitled && !alreadyEntitled) {
    // fetchSubscription() alone doesn't surface the individual payment id —
    // look it up via the Invoices API (see razorpay.service.ts's
    // fetchSubscriptionPayments) and credit under that REAL id. A synthetic
    // placeholder id here would not match whatever real id the webhook or
    // client verify later uses for the same charge, and creditWallet's
    // idempotency is keyed on the id passed in — so a synthetic id risks
    // crediting the same charge twice under two different ids.
    const payments = await fetchSubscriptionPayments(subscriptionId);
    const firstPayment = payments[0];
    if (!firstPayment) {
      // Razorpay says entitled, but no invoice/payment is visible yet
      // (can lag briefly) — sync status only and let the next check credit
      // it once the payment is actually queryable.
      await updateNewMandateStatus(uid, subscriptionId, subscription.status as MandateStatus, subscription.status);
      return subscription.status as MandateStatus;
    }
    await applyNewMandateEntitlement(uid, subscriptionId, firstPayment.paymentId, subscription.status, {
      via: 'reconciliation',
    });
    return 'active';
  }

  await updateNewMandateStatus(uid, subscriptionId, subscription.status as MandateStatus, subscription.status);
  return subscription.status as MandateStatus;
}

/** Cancels a mandate — `cancelAtCycleEnd` keeps access live until the current period ends. */
export async function cancelNewMandateSubscription(
  uid: string,
  subscriptionId: string,
  cancelAtCycleEnd: boolean,
): Promise<void> {
  const cycleSnapshot = await adminFirestore().collection('subscriptions').doc(subscriptionId).get();
  if (!cycleSnapshot.exists || cycleSnapshot.data()?.userId !== uid) {
    throw new ValidationError('This subscription does not belong to this account.');
  }

  const cancelled = await cancelRazorpaySubscription(subscriptionId, cancelAtCycleEnd);
  await updateNewMandateStatus(uid, subscriptionId, cancelled.status as MandateStatus, cancelled.status);
}
