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

export interface CreatedSubscription {
  subscriptionId: string;
  keyId: string;
}

/**
 * Creates a real Razorpay Subscription against an existing Plan (created in
 * the Razorpay dashboard). total_count is a required upper bound on Razorpay's
 * side, not a real expiry — 120 monthly cycles (~10 years) is used to mean
 * "renew until cancelled".
 */
export async function createSubscription(
  planId: string,
  notes?: Record<string, string>,
): Promise<CreatedSubscription> {
  const client = getClient();
  const subscription = await client.subscriptions.create({
    plan_id: planId,
    total_count: 120,
    customer_notify: 1,
    notes,
  });
  return { subscriptionId: subscription.id, keyId: env.razorpay.keyId! };
}

export async function fetchSubscription(subscriptionId: string) {
  const client = getClient();
  return client.subscriptions.fetch(subscriptionId);
}

export async function cancelSubscription(subscriptionId: string, cancelAtCycleEnd = false) {
  const client = getClient();
  return client.subscriptions.cancel(subscriptionId, cancelAtCycleEnd);
}

export interface VerifySubscriptionSignatureInput {
  subscriptionId: string;
  paymentId: string;
  signature: string;
}

/**
 * Razorpay's subscription-checkout signature scheme differs from the
 * order-payment one: HMAC-SHA256(payment_id + '|' + subscription_id,
 * key_secret), not order_id + payment_id.
 */
export function verifySubscriptionSignature(input: VerifySubscriptionSignatureInput): void {
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
