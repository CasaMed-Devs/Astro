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

export interface CreatedOrder {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

export async function createOrder(
  amount: number,
  currency: string,
  receipt: string,
  notes?: Record<string, string>,
): Promise<CreatedOrder> {
  const client = getClient();
  const order = await client.orders.create({ amount, currency, receipt, notes });
  return {
    orderId: order.id,
    amount: Number(order.amount),
    currency: order.currency,
    keyId: env.razorpay.keyId!,
  };
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
