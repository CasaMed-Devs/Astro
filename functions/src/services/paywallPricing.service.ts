import { FieldValue } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';

export interface PaywallPrice {
  amount?: number; // Rupees
  currency?: string;
}

export interface CreditPricing {
  // "The price of 1 credit" — the single global number that drives both the
  // top-up conversion rate and (indirectly) how many credits a subscription
  // payment grants. Admin-editable; changes apply instantly app-wide. Cost
  // per chat message is a separate, fixed constant (see credits.service.ts's
  // CREDIT_COST_PER_MESSAGE), not derived from this.
  rupeesPerCredit?: number;
}

export interface TopUpConfig {
  minAmount?: number; // Rupees
  maxAmount?: number; // Rupees
  presetAmounts?: number[]; // Rupees
  currency?: string;
}

export interface PaywallPricingRecord {
  creditPricing?: CreditPricing;
  trialAmount?: PaywallPrice;
  subscriptionAmount?: PaywallPrice;
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
