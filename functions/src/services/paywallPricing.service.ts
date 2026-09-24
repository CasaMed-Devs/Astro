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
  // The legacy token engine's display/charge price (config/plans.ts's
  // getSubscriptionAmount) — left as-is, still used for every pre-existing
  // mandate registered before the Subscriptions API switch.
  subscriptionAmount?: PaywallPrice;
  // Separate field, deliberately not merged into subscriptionAmount above:
  // this is where the real Razorpay Plan ID for the Subscriptions-API engine
  // lives (see mandate.service.ts's startNewMandateSubscription). Confirmed
  // already present in production at
  // appConfig/paywallPricing.subscription.razorpayPlanId — apparently set up
  // for this switch before, then unused until now.
  subscription?: PaywallPrice & { razorpayPlanId?: string };
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
