import { apiClient } from '@/services/apiClient';
import { AppError } from '@/utils/errors';
import type { MandateDoc, MandateMethod, MandateStatus } from '@/types/firestore';

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

export interface PublicPricing {
  trial: { amount: number; currency: string };
  subscription: { amount: number; currency: string };
  report: { amount?: number; currency?: string };
  rupeesPerCredit: number;
}

export interface TopUpConfig {
  minAmount: number; // Rupees
  maxAmount: number; // Rupees
  rupeesPerCredit: number;
  presetAmounts: number[]; // Rupees
  currency: string;
}

export interface TopUpResult {
  status: string;
  creditsAwarded: number;
  newBalance: number;
}

export interface TopUpHistoryItem {
  id: string;
  amount: number; // Rupees
  creditsAwarded: number;
  status: string;
  createdAt: string | null; // ISO
}

/** A brand-new mandate registration via Razorpay's Subscriptions API — every registration now, trial or direct. */
export interface NewMandateSubscription {
  subscriptionId: string;
  shortUrl: string;
  status: string;
  keyId: string;
}

export interface VerifySubscriptionInput {
  subscriptionId: string;
  paymentId: string;
  signature: string;
}

export interface ReconcileResult {
  resolved: { purpose: string; orderId: string }[];
  pending: number;
  // The user's mandate status after being checked directly against Razorpay
  // (catches a mandate Razorpay already cancelled, before the next scheduled
  // auto-debit attempt would otherwise be the first thing to notice).
  mandateStatus: MandateStatus;
}

/**
 * Safety net for a payment whose in-app verify and webhook both missed: asks
 * the backend to re-check recent unresolved orders with Razorpay and apply
 * any captured payment. Idempotent, so it is safe to call repeatedly.
 */
export function reconcilePayments(): Promise<ReconcileResult> {
  return apiClient.post<ReconcileResult>('/payments/reconcile');
}

export function getPricing(): Promise<PublicPricing> {
  return apiClient.get<PublicPricing>('/payments/pricing');
}

export function getMandate(): Promise<MandateDoc> {
  return apiClient.get<MandateDoc>('/mandate/me');
}

/**
 * Starts the Rs.1 trial: registers a card/UPI auto-debit mandate via
 * Razorpay's Subscriptions API. The returned `shortUrl` is a Razorpay-hosted
 * page — open it in a browser, then poll getMandate()/getMyProfile() for the
 * webhook-confirmed result. Prefer startTrialOrder below for the native
 * in-app Checkout SDK instead of this hosted-page redirect.
 */
export function startTrialPayment(method: MandateMethod): Promise<NewMandateSubscription> {
  return apiClient.post<NewMandateSubscription>('/payments/trial/start', { method });
}

/** Rs.1 trial mandate via the native Razorpay Checkout SDK (pass `subscription_id`, not `order_id`, to RazorpayCheckout.open). */
export function startTrialOrder(method: MandateMethod): Promise<NewMandateSubscription> {
  return apiClient.post<NewMandateSubscription>('/payments/trial/order', { method });
}

/** Confirms the trial right after checkout; 'pending' means the webhook will finish it. */
export function verifyTrialPayment(input: VerifySubscriptionInput): Promise<{ status: 'ok' | 'pending' }> {
  return apiClient.post('/payments/trial/verify', input);
}

/** "Subscribe Rs.299" via the native Razorpay Checkout SDK — always a real payment, no existing-mandate fast path anymore. */
export function startSubscriptionOrder(method?: MandateMethod): Promise<NewMandateSubscription> {
  return apiClient.post('/payments/subscription/order', { method });
}

export function verifySubscriptionPayment(
  input: VerifySubscriptionInput,
): Promise<{ status: 'ok' | 'pending' }> {
  return apiClient.post('/payments/subscription/verify', input);
}

/** Live-checks a mandate directly against Razorpay and syncs/credits local state — self-healing counterpart to the webhook. */
export function checkSubscriptionStatus(subscriptionId: string): Promise<{ mandateStatus: MandateStatus }> {
  return apiClient.get(`/payments/subscription/status?subscriptionId=${encodeURIComponent(subscriptionId)}`);
}

/** Cancels a mandate — defaults to keeping access until the current billing period ends. */
export function cancelSubscription(subscriptionId: string, cancelAtCycleEnd = true): Promise<{ status: string }> {
  return apiClient.post('/payments/subscription/cancel', { subscriptionId, cancelAtCycleEnd });
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

export function getTopUpHistory(): Promise<TopUpHistoryItem[]> {
  return apiClient.get<TopUpHistoryItem[]>('/payments/history');
}

export function createTopUpOrder(amountRupees: number): Promise<PaymentOrder> {
  return apiClient.post<PaymentOrder>('/payments/topup/order', { amount: amountRupees });
}

export function verifyTopUpPayment(input: VerifyPaymentInput): Promise<TopUpResult> {
  return apiClient.post<TopUpResult>('/payments/topup/verify', input);
}

/**
 * Opens the Razorpay checkout UI for a backend-issued one-time order
 * (top-up/report — the only remaining order-based flows). The client never
 * decides success on its own — callers must still invoke the matching
 * `verify*` endpoint with the returned signature before unlocking anything.
 */
export async function openRazorpayCheckout(
  order: PaymentOrder,
  options: { name: string; description: string; contact?: string },
): Promise<VerifyPaymentInput> {
  const RazorpayCheckout = loadRazorpayCheckout();

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
 * Opens the Razorpay checkout UI for a mandate registration (trial or direct
 * subscription) — every mandate registration now, via the Subscriptions API.
 * Same never-trust-the-client contract as openRazorpayCheckout: callers must
 * still invoke verifyTrialPayment/verifySubscriptionPayment afterward.
 */
export async function openRazorpaySubscriptionCheckout(
  subscription: NewMandateSubscription,
  options: { name: string; description: string; contact?: string; method?: MandateMethod },
): Promise<VerifySubscriptionInput> {
  const RazorpayCheckout = loadRazorpayCheckout();

  try {
    const result = await RazorpayCheckout.open({
      key: subscription.keyId,
      subscription_id: subscription.subscriptionId,
      name: options.name,
      description: options.description,
      prefill: options.contact
        ? { contact: options.contact, ...(options.method ? { method: options.method } : {}) }
        : undefined,
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

/** Loaded lazily: the native module is missing in Expo Go, and a top-level import would crash every screen that imports this service. */
function loadRazorpayCheckout(): typeof import('react-native-razorpay').default {
  try {
    return require('react-native-razorpay').default;
  } catch {
    throw new AppError(
      'payment/cancelled',
      'Payments need a development build of the app (not Expo Go).',
    );
  }
}
