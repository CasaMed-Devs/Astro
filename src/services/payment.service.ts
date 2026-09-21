import { apiClient } from '@/services/apiClient';
import { AppError } from '@/utils/errors';
import type { MandateDoc, MandateMethod } from '@/types/firestore';

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

export interface StartRegistrationResult {
  registrationLinkId: string;
  shortUrl: string;
}

export interface UpgradeNowResult {
  status: 'charged' | 'registration_required';
  creditsAwarded?: number;
  newBalance?: number;
  registrationLinkId?: string;
  shortUrl?: string;
}

export interface ReconcileResult {
  resolved: { purpose: string; orderId: string }[];
  pending: number;
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
 * Starts the Rs.1 trial: registers a card/UPI auto-debit mandate. The
 * returned `shortUrl` is a Razorpay-hosted page — open it in a browser
 * (see openRegistrationLink below), then poll getMandate()/getMyProfile()
 * for the webhook-confirmed result. No RazorpayCheckout.open() here; that
 * SDK is only for order-based one-time payments (top-up/report).
 */
export function startTrialPayment(method: MandateMethod): Promise<StartRegistrationResult> {
  return apiClient.post<StartRegistrationResult>('/payments/trial/start', { method });
}

/**
 * "Subscribe Rs.299 now" — charges the existing mandate immediately, or (if
 * no mandate exists yet) starts registration directly at the subscription
 * amount, skipping the trial. `method` is required only in the latter case.
 */
export interface RecurringOrder extends PaymentOrder {
  customerId: string;
}

/** Rs.1 trial mandate via the native Razorpay Checkout (no hosted-page redirect). */
export function startTrialOrder(method: MandateMethod): Promise<RecurringOrder> {
  return apiClient.post<RecurringOrder>('/payments/trial/order', { method });
}

/** Confirms the trial right after checkout; 'pending' means the webhook will finish it. */
export function verifyTrialPayment(input: VerifyPaymentInput): Promise<{ status: 'ok' | 'pending' }> {
  return apiClient.post('/payments/trial/verify', input);
}

/**
 * "Subscribe" via the native Razorpay Checkout. `customerId` is set only when
 * the order also registers an auto-debit mandate (no active one yet).
 */
export function startSubscriptionOrder(
  method?: MandateMethod,
): Promise<PaymentOrder & { customerId?: string }> {
  return apiClient.post('/payments/subscription/order', { method });
}

export function verifySubscriptionPayment(
  input: VerifyPaymentInput,
): Promise<{ status: 'ok' | 'pending' }> {
  return apiClient.post('/payments/subscription/verify', input);
}

export function upgradeNow(method?: MandateMethod): Promise<UpgradeNowResult> {
  return apiClient.post<UpgradeNowResult>('/payments/subscription/upgrade-now', { method });
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
 * Opens the Razorpay checkout UI for a backend-issued order. The client
 * never decides success on its own — callers must still invoke the
 * matching `verify*` endpoint with the returned signature before
 * unlocking anything.
 */
export async function openRazorpayCheckout(
  order: PaymentOrder,
  options: {
    name: string;
    description: string;
    contact?: string;
    // Set for recurring-mandate registration (customer-bound order).
    customerId?: string;
    method?: MandateMethod;
  },
): Promise<VerifyPaymentInput> {
  let RazorpayCheckout: typeof import('react-native-razorpay').default;
  try {
    // Loaded lazily: the native module is missing in Expo Go, and a top-level
    // import would crash every screen that imports this service.
    RazorpayCheckout = require('react-native-razorpay').default;
  } catch {
    throw new AppError(
      'payment/cancelled',
      'Payments need a development build of the app (not Expo Go).',
    );
  }

  try {
    const result = await RazorpayCheckout.open({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: options.name,
      description: options.description,
      prefill: options.contact
        ? { contact: options.contact, ...(options.method ? { method: options.method } : {}) }
        : undefined,
      ...(options.customerId ? { customer_id: options.customerId, recurring: '1' } : {}),
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
