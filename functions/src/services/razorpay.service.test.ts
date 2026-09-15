import { createHmac } from 'crypto';

import { verifyPaymentSignature, verifyWebhookSignature } from './razorpay.service';
import { PaymentVerificationError } from '../utils/errors';

const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET!;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET!;

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
