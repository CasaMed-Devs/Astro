import { FieldValue } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';

export interface PaywallPrice {
  amount?: number;
  currency?: string;
}

export interface PaywallPricingRecord {
  subscription?: PaywallPrice;
  report?: PaywallPrice;
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
