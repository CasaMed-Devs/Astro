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

// 10 years — Razorpay requires an expiry on a mandate; this just means
// "don't expire it on us", not a real subscription term.
const MANDATE_EXPIRE_AT = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 60 * 60;
// Upper bound Razorpay enforces per auto-debit under this mandate.
const MANDATE_MAX_AMOUNT_RUPEES = 500;

export interface RazorpayCustomerRef {
  customerId: string;
}

/**
 * Gets-or-creates a Razorpay Customer for this user, keyed by phone number.
 * fail_existing:0 makes Razorpay return the existing customer instead of
 * erroring if one with the same contact already exists — needed since a
 * user might restart the trial flow (e.g. app reinstall) without us having
 * their customer id cached yet.
 */
export async function getOrCreateCustomer(
  phoneNumber: string,
  notes?: Record<string, string>,
): Promise<RazorpayCustomerRef> {
  const client = getClient();
  const customer = await client.customers.create({
    contact: phoneNumber,
    fail_existing: 0,
    notes,
  });
  return { customerId: customer.id };
}

export interface CreatedRegistration {
  registrationLinkId: string;
  shortUrl: string;
  customerId: string;
}

/**
 * Registers a recurring mandate (card or UPI Autopay) via Razorpay's
 * Recurring Payments "registration link" product — distinct from the rigid
 * Plan+cycle Subscriptions API. The user completes the hosted `shortUrl` to
 * pay the authorization amount and grant the mandate; Razorpay confirms via
 * the `payment.captured`/`token.confirmed` webhooks (see webhook.controller.ts),
 * which is the source of truth — this call only kicks the flow off.
 */
export async function createRecurringRegistration(
  customerId: string,
  authorizationAmountRupees: number,
  method: 'card' | 'upi',
  notes?: Record<string, string>,
): Promise<CreatedRegistration> {
  const client = getClient();
  const link = await client.subscriptions.createRegistrationLink({
    customer_id: customerId,
    type: 'link',
    amount: rupeesToPaise(authorizationAmountRupees),
    currency: 'INR',
    description: 'Astro101 recurring mandate setup',
    subscription_registration: {
      method,
      max_amount: rupeesToPaise(MANDATE_MAX_AMOUNT_RUPEES),
      expire_at: MANDATE_EXPIRE_AT,
    },
    notes,
  } as unknown as Parameters<Razorpay['subscriptions']['createRegistrationLink']>[0]);

  return {
    registrationLinkId: link.id,
    shortUrl: (link as unknown as { short_url: string }).short_url,
    customerId,
  };
}

/**
 * Charges an already-registered mandate (card or UPI) for an arbitrary
 * amount at a time of our choosing — this is what the day-2 and monthly
 * auto-debit scheduler calls, and what "upgrade now" uses to charge
 * immediately. Two-step per Razorpay's Recurring Payments contract: create a
 * plain order tied to the customer, then create a payment against it using
 * the saved token with recurring:1 (no customer present, no checkout UI).
 */
export async function chargeRecurringToken(
  customerId: string,
  tokenId: string,
  amountRupees: number,
  receipt: string,
  contact: string,
  notes?: Record<string, string>,
): Promise<{ paymentId: string; orderId: string }> {
  const client = getClient();
  const order = await client.orders.create({
    amount: rupeesToPaise(amountRupees),
    currency: 'INR',
    receipt,
    customer_id: customerId,
    notes,
  } as unknown as Parameters<Razorpay['orders']['create']>[0]);

  const payment = await client.payments.createRecurringPayment({
    amount: rupeesToPaise(amountRupees),
    currency: 'INR',
    order_id: order.id,
    customer_id: customerId,
    token: tokenId,
    recurring: 1,
    email: `${customerId}@auto-debit.astro101.app`,
    contact,
    notes: notes ?? {},
  });

  if (!payment.razorpay_payment_id) {
    throw new PaymentVerificationError('Recurring charge did not return a payment id.');
  }

  return { paymentId: payment.razorpay_payment_id, orderId: order.id };
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
