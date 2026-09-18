import RazorpayCheckout from 'react-native-razorpay';

import { apiClient } from '@/services/apiClient';
import { AppError } from '@/utils/errors';

export interface PaymentOrder {
  orderId: string;
  // In paise — the Razorpay Checkout SDK requires this to exactly match the
  // order the backend created (a Razorpay API constraint). Everywhere else
  // in the app (config, request bodies shown below, display) uses Rupees.
  amount: number;
  currency: string;
  keyId: string;
}

export interface VerifyPaymentInput {
  orderId: string;
  paymentId: string;
  signature: string;
}

export interface SubscriptionCheckout {
  subscriptionId: string;
  keyId: string;
}

export interface VerifySubscriptionInput {
  subscriptionId: string;
  paymentId: string;
  signature: string;
}

export interface PublicPricing {
  subscription: { amount?: number; currency?: string };
  report: { amount?: number; currency?: string };
}

export interface TopUpConfig {
  minAmount: number; // Rupees
  maxAmount: number; // Rupees
  creditsPerRupee: number;
  presetAmounts: number[]; // Rupees
  currency: string;
}

export interface TopUpResult {
  status: string;
  creditsAwarded: number;
  newBalance: number;
}

export function getPricing(): Promise<PublicPricing> {
  return apiClient.get<PublicPricing>('/payments/pricing');
}

export function createSubscriptionOrder(planId: string): Promise<SubscriptionCheckout> {
  return apiClient.post<SubscriptionCheckout>('/payments/subscription/order', { planId });
}

export function verifySubscriptionPayment(
  input: VerifySubscriptionInput,
): Promise<{ status: string }> {
  return apiClient.post('/payments/subscription/verify', input);
}

export function createReportOrder(): Promise<PaymentOrder> {
  return apiClient.post<PaymentOrder>('/payments/report/order');
}

export function verifyReportPayment(input: VerifyPaymentInput): Promise<{ status: string }> {
  return apiClient.post('/payments/report/verify', input);
}

export function getTopUpConfig(): Promise<TopUpConfig> {
  return apiClient.get<TopUpConfig>('/payments/topup/config');
}

export function createTopUpOrder(amountRupees: number): Promise<PaymentOrder> {
  return apiClient.post<PaymentOrder>('/payments/topup/order', { amount: amountRupees });
}

export function verifyTopUpPayment(input: VerifyPaymentInput): Promise<TopUpResult> {
  return apiClient.post<TopUpResult>('/payments/topup/verify', input);
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
      orderId: result.razorpay_order_id!,
      paymentId: result.razorpay_payment_id,
      signature: result.razorpay_signature,
    };
  } catch {
    throw new AppError('payment/cancelled', 'Payment was cancelled or could not be completed.');
  }
}

/**
 * Opens the Razorpay checkout UI for a real recurring Subscription (not a
 * one-time order) — passes subscription_id instead of order_id/amount, per
 * Razorpay's subscription-checkout contract.
 */
export async function openRazorpaySubscriptionCheckout(
  subscription: SubscriptionCheckout,
  options: { name: string; description: string; contact?: string },
): Promise<VerifySubscriptionInput> {
  try {
    const result = await RazorpayCheckout.open({
      key: subscription.keyId,
      subscription_id: subscription.subscriptionId,
      name: options.name,
      description: options.description,
      prefill: options.contact ? { contact: options.contact } : undefined,
      theme: { color: '#B25F0A' },
    });

    return {
      subscriptionId: result.razorpay_subscription_id!,
      paymentId: result.razorpay_payment_id,
      signature: result.razorpay_signature,
    };
  } catch {
    throw new AppError('payment/cancelled', 'Payment was cancelled or could not be completed.');
  }
}
