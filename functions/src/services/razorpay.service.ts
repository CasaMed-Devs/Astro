import { createHmac, timingSafeEqual } from 'crypto';
import Razorpay from 'razorpay';

import { env } from '../config/env';
import { HttpError, PaymentVerificationError } from '../utils/errors';

class RazorpayNotConfiguredError extends HttpError {
  constructor() {
    super(503, 'Payments are temporarily unavailable.');
  }
}

function getClient(): Razorpay {
  if (!env.razorpay.keyId || !env.razorpay.keySecret) {
    throw new RazorpayNotConfiguredError();
  }
  return new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret });
}

/**
 * Razorpay's API only ever accepts/returns amounts in the smallest currency
 * unit (paise for INR) — this is a hard constraint of their API, not a
 * choice made here. Every other layer of this app (Firestore config, admin
 * dashboard, request/response bodies, mobile display) works in whole
 * Rupees; this is the one conversion point where that boundary is crossed.
 */
export function rupeesToPaise(amountRupees: number): number {
  return Math.round(amountRupees * 100);
}

export function paiseToRupees(amountPaise: number): number {
  return amountPaise / 100;
}

export interface CreatedOrder {
  orderId: string;
  // In paise — the Razorpay Checkout SDK (mobile) requires this to exactly
  // match the order it created, so this one field stays in paise rather
  // than being converted back to Rupees like everything else in this app.
  amount: number;
  currency: string;
  keyId: string;
}

export async function createOrder(
  amountRupees: number,
  currency: string,
  receipt: string,
  notes?: Record<string, string>,
): Promise<CreatedOrder> {
  const client = getClient();
  const order = await client.orders.create({
    amount: rupeesToPaise(amountRupees),
    currency,
    receipt,
    notes,
  });
  return {
    orderId: order.id,
    amount: Number(order.amount),
    currency: order.currency,
    keyId: env.razorpay.keyId!,
  };
}

export async function fetchOrder(orderId: string) {
  const client = getClient();
  return client.orders.fetch(orderId);
}

export interface OrderPayment {
  id: string;
  status: string;
  amount: number; // paise
  method?: string | null; // card | upi | netbanking | ...
  token_id?: string | null;
  customer_id?: string | null;
}

/** Every payment attempt Razorpay has for an order (used by reconciliation). */
export async function fetchOrderPayments(orderId: string): Promise<OrderPayment[]> {
  const result = (await getClient().orders.fetchPayments(orderId)) as unknown as {
    items?: OrderPayment[];
  };
  return result.items ?? [];
}

export interface VerifySignatureInput {
  orderId: string;
  paymentId: string;
  signature: string;
}

/**
 * Razorpay's documented order-payment signature scheme:
 * HMAC-SHA256(order_id + '|' + payment_id, key_secret) must equal the
 * signature returned by checkout. Never trust the client's "success"
 * callback without this check.
 */
export function verifyPaymentSignature(input: VerifySignatureInput): void {
  if (!env.razorpay.keySecret) {
    throw new RazorpayNotConfiguredError();
  }

  const expected = createHmac('sha256', env.razorpay.keySecret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(input.signature, 'hex');

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    throw new PaymentVerificationError();
  }
}

export function verifyWebhookSignature(rawBody: string, signature: string): void {
  if (!env.razorpay.webhookSecret) {
    throw new RazorpayNotConfiguredError();
  }

  const expected = createHmac('sha256', env.razorpay.webhookSecret).update(rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(signature, 'hex');

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    throw new PaymentVerificationError('Webhook signature mismatch.');
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Razorpay Subscriptions API — every mandate registration goes through this
// now (see mandate.service.ts's startNewMandateSubscription). Razorpay owns
// the billing schedule, retries, and lifecycle entirely; there is no
// self-initiated charging or scheduled job on our side anymore.
// ─────────────────────────────────────────────────────────────────────────

export interface CreatedSubscription {
  subscriptionId: string;
  status: string;
  shortUrl: string;
  keyId: string;
}

/**
 * Creates a Razorpay Subscription. For a plain (non-trial) signup, this is
 * just plan_id + total_count — Razorpay bills the plan amount on its own
 * schedule from the start. For the Rs.1 trial, `addonAmountRupees` (an
 * immediate one-time charge, separate from the plan) plus `startAtSeconds`
 * (delaying the plan's own first charge) reproduces the "Rs.1 now, Rs.299
 * starting tomorrow" schedule — the same pattern Vireel's
 * createWeeklyTrialSubscription uses, and the reason a fixed-interval
 * Subscription can still express an irregular first interval.
 */
export async function createRecurringSubscription(
  planId: string,
  totalCount: number,
  notes: Record<string, string>,
  options?: { startAtSeconds?: number; addonAmountRupees?: number; addonName?: string },
): Promise<CreatedSubscription> {
  const client = getClient();

  const subscription = await client.subscriptions.create({
    plan_id: planId,
    total_count: totalCount,
    quantity: 1,
    customer_notify: 1,
    ...(options?.startAtSeconds ? { start_at: options.startAtSeconds } : {}),
    ...(options?.addonAmountRupees
      ? {
          addons: [
            {
              item: {
                name: options.addonName ?? 'Trial',
                amount: rupeesToPaise(options.addonAmountRupees),
                currency: 'INR',
              },
            },
          ],
        }
      : {}),
    notes,
  } as unknown as Parameters<Razorpay['subscriptions']['create']>[0]);

  return {
    subscriptionId: subscription.id,
    status: subscription.status,
    shortUrl: subscription.short_url,
    keyId: env.razorpay.keyId!,
  };
}

export async function fetchSubscription(subscriptionId: string) {
  return getClient().subscriptions.fetch(subscriptionId);
}

/** `cancelAtCycleEnd: true` keeps access/billing live until the current period ends; `false` cancels immediately. */
export async function cancelSubscription(subscriptionId: string, cancelAtCycleEnd: boolean) {
  return getClient().subscriptions.cancel(subscriptionId, cancelAtCycleEnd);
}

/**
 * Razorpay's documented subscription-checkout signature scheme — DIFFERENT
 * from verifyPaymentSignature above (which is order_id|payment_id): here it's
 * HMAC-SHA256(payment_id + '|' + subscription_id, key_secret). The Checkout
 * SDK returns razorpay_subscription_id (not razorpay_order_id) when checkout
 * was opened with a subscription_id — see openRazorpayCheckout on the client.
 */
export interface VerifySubscriptionSignatureInput {
  subscriptionId: string;
  paymentId: string;
  signature: string;
}

export function verifySubscriptionPaymentSignature(input: VerifySubscriptionSignatureInput): void {
  if (!env.razorpay.keySecret) {
    throw new RazorpayNotConfiguredError();
  }

  const expected = createHmac('sha256', env.razorpay.keySecret)
    .update(`${input.paymentId}|${input.subscriptionId}`)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(input.signature, 'hex');

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    throw new PaymentVerificationError();
  }
}

export interface SubscriptionPayment {
  paymentId: string;
  amountPaise: number;
  currency: string;
  createdAt: number; // unix seconds
}

/**
 * Returns captured payments for one subscription, oldest first — the real
 * payment id(s) behind its charges. fetchSubscription() alone never surfaces
 * this (Razorpay's subscription entity doesn't carry payment ids), and
 * `payments.all({ subscription_id })` silently ignores that filter and
 * returns payments across the whole merchant account — the Invoices API is
 * the only correct way to scope this to one subscription. Used by
 * checkNewMandateStatus (mandate.service.ts) so its self-heal path can credit
 * a charge under its real payment id instead of a synthetic placeholder,
 * which would otherwise not match — and so double-credit — whatever id the
 * webhook or client verify uses for the same charge.
 */
export async function fetchSubscriptionPayments(subscriptionId: string): Promise<SubscriptionPayment[]> {
  const response = await getClient().invoices.all({
    subscription_id: subscriptionId,
    count: 100,
  } as unknown as Parameters<Razorpay['invoices']['all']>[0]);

  const invoices = (response as unknown as { items?: Record<string, unknown>[] }).items ?? [];

  return invoices
    .filter((inv) => inv.subscription_id === subscriptionId && inv.status === 'paid' && !!inv.payment_id)
    .map((inv) => ({
      paymentId: inv.payment_id as string,
      amountPaise: Number(inv.amount_paid ?? inv.amount ?? 0),
      currency: String(inv.currency ?? 'INR'),
      createdAt: Number(inv.created_at ?? 0),
    }))
    .sort((a, b) => a.createdAt - b.createdAt);
}
