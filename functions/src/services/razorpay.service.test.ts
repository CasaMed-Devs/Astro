import { createHmac } from 'crypto';

import {
  paiseToRupees,
  rupeesToPaise,
  verifyPaymentSignature,
  verifySubscriptionSignature,
  verifyWebhookSignature,
} from './razorpay.service';
import { PaymentVerificationError } from '../utils/errors';

const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET!;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET!;

describe('rupeesToPaise / paiseToRupees', () => {
  it('converts whole Rupees to paise', () => {
    expect(rupeesToPaise(50)).toBe(5000);
    expect(rupeesToPaise(499)).toBe(49900);
  });

  it('rounds fractional paise from decimal Rupee amounts instead of truncating/floating-point drifting', () => {
    // 19.99 * 100 is 1998.9999999999998 in floating point — must round to 1999, not truncate to 1998.
    expect(rupeesToPaise(19.99)).toBe(1999);
    expect(rupeesToPaise(0.1)).toBe(10);
  });

  it('converts paise back to Rupees', () => {
    expect(paiseToRupees(5000)).toBe(50);
    expect(paiseToRupees(49900)).toBe(499);
  });

  it('round-trips without drift for typical amounts', () => {
    for (const rupees of [50, 100, 299, 1000, 4999]) {
      expect(paiseToRupees(rupeesToPaise(rupees))).toBe(rupees);
    }
  });
});

function signOrderPayment(orderId: string, paymentId: string): string {
  return createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
}

describe('verifyPaymentSignature', () => {
  it('accepts a signature computed the same way Razorpay computes it', () => {
    const orderId = 'order_123';
    const paymentId = 'pay_456';
    const signature = signOrderPayment(orderId, paymentId);

    expect(() => verifyPaymentSignature({ orderId, paymentId, signature })).not.toThrow();
  });

  it('rejects a tampered signature', () => {
    const orderId = 'order_123';
    const paymentId = 'pay_456';
    const signature = signOrderPayment(orderId, 'pay_different');

    expect(() => verifyPaymentSignature({ orderId, paymentId, signature })).toThrow(
      PaymentVerificationError,
    );
  });

  it('rejects a signature for a different order id (prevents cross-order replay)', () => {
    const signature = signOrderPayment('order_999', 'pay_456');

    expect(() =>
      verifyPaymentSignature({ orderId: 'order_123', paymentId: 'pay_456', signature }),
    ).toThrow(PaymentVerificationError);
  });
});

function signSubscriptionPayment(paymentId: string, subscriptionId: string): string {
  return createHmac('sha256', KEY_SECRET).update(`${paymentId}|${subscriptionId}`).digest('hex');
}

describe('verifySubscriptionSignature', () => {
  it('accepts a signature computed the same way Razorpay computes it for subscriptions', () => {
    const paymentId = 'pay_456';
    const subscriptionId = 'sub_123';
    const signature = signSubscriptionPayment(paymentId, subscriptionId);

    expect(() =>
      verifySubscriptionSignature({ paymentId, subscriptionId, signature }),
    ).not.toThrow();
  });

  it('rejects an order-payment signature reused for a subscription (different HMAC input order)', () => {
    // order-payment scheme is orderId|paymentId; subscription scheme is
    // paymentId|subscriptionId — a signature valid for one must not verify
    // for the other, even with the same underlying ids.
    const paymentId = 'pay_456';
    const subscriptionId = 'sub_123';
    const orderSignature = createHmac('sha256', KEY_SECRET)
      .update(`${subscriptionId}|${paymentId}`)
      .digest('hex');

    expect(() =>
      verifySubscriptionSignature({ paymentId, subscriptionId, signature: orderSignature }),
    ).toThrow(PaymentVerificationError);
  });

  it('rejects a signature for a different subscription id (prevents cross-subscription replay)', () => {
    const signature = signSubscriptionPayment('pay_456', 'sub_999');

    expect(() =>
      verifySubscriptionSignature({
        paymentId: 'pay_456',
        subscriptionId: 'sub_123',
        signature,
      }),
    ).toThrow(PaymentVerificationError);
  });
});

describe('verifyWebhookSignature', () => {
  it('accepts a signature computed over the exact raw body', () => {
    const rawBody = JSON.stringify({ event: 'subscription.charged' });
    const signature = createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');

    expect(() => verifyWebhookSignature(rawBody, signature)).not.toThrow();
  });

  it('rejects a signature if the body was altered after signing', () => {
    const signedBody = JSON.stringify({ event: 'subscription.charged' });
    const signature = createHmac('sha256', WEBHOOK_SECRET).update(signedBody).digest('hex');
    const tamperedBody = JSON.stringify({ event: 'subscription.cancelled' });

    expect(() => verifyWebhookSignature(tamperedBody, signature)).toThrow(PaymentVerificationError);
  });
});
