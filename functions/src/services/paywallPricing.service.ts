import { FieldValue } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';

export interface PaywallPrice {
  amount?: number; // Rupees
  currency?: string;
}

export interface SubscriptionPrice extends PaywallPrice {
  // The Razorpay Plan (plan_xxx) the subscription checkout uses for
  // auto-recurring billing. Set from the admin dashboard.
  razorpayPlanId?: string;
}

export interface TopUpConfig {
  minAmount?: number; // Rupees
  maxAmount?: number; // Rupees
  creditsPerRupee?: number;
  presetAmounts?: number[]; // Rupees
  currency?: string;
}

export interface PaywallPricingRecord {
  subscription?: SubscriptionPrice;
  report?: PaywallPrice;
  topUp?: TopUpConfig;
}

const PAYWALL_PRICING_DOC = 'paywallPricing';

function paywallPricingRef() {
  return adminFirestore().collection('appConfig').doc(PAYWALL_PRICING_DOC);
}

export async function getPaywallPricingDoc(): Promise<PaywallPricingRecord> {
  const snapshot = await paywallPricingRef().get();
  return (snapshot.data() as PaywallPricingRecord | undefined) ?? {};
}

export async function setPaywallPricing(update: PaywallPricingRecord): Promise<void> {
  await paywallPricingRef().set(
    { ...update, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}
