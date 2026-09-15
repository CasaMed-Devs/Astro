import RazorpayCheckout from 'react-native-razorpay';

import { apiClient } from '@/services/apiClient';
import { AppError } from '@/utils/errors';

export interface PaymentOrder {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

export interface VerifyPaymentInput {
  orderId: string;
  paymentId: string;
  signature: string;
}

export function createSubscriptionOrder(planId: string): Promise<PaymentOrder> {
  return apiClient.post<PaymentOrder>('/payments/subscription/order', { planId });
}

export function verifySubscriptionPayment(input: VerifyPaymentInput): Promise<{ status: string }> {
  return apiClient.post('/payments/subscription/verify', input);
}

export function createReportOrder(): Promise<PaymentOrder> {
  return apiClient.post<PaymentOrder>('/payments/report/order');
}

export function verifyReportPayment(input: VerifyPaymentInput): Promise<{ status: string }> {
  return apiClient.post('/payments/report/verify', input);
}

/**
 * Opens the Razorpay checkout UI for a backend-issued order. The client
 * never decides success on its own — callers must still invoke the
 * matching `verify*` endpoint with the returned signature before
 * unlocking anything.
 */
export async function openRazorpayCheckout(
  order: PaymentOrder,
  options: { name: string; description: string; contact?: string },
): Promise<VerifyPaymentInput> {
  try {
    const result = await RazorpayCheckout.open({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: options.name,
      description: options.description,
      prefill: options.contact ? { contact: options.contact } : undefined,
      theme: { color: '#B25F0A' },
    });

    return {
      orderId: result.razorpay_order_id,
      paymentId: result.razorpay_payment_id,
      signature: result.razorpay_signature,
    };
  } catch {
    throw new AppError('payment/cancelled', 'Payment was cancelled or could not be completed.');
  }
}
