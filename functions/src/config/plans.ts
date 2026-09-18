import { env } from './env';
import { getPaywallPricingDoc, type TopUpConfig } from '../services/paywallPricing.service';

export interface ResolvedPrice {
  amount: number; // Rupees
  currency: string;
}

/**
 * The Rs.1 trial mandate-registration amount, admin-editable via
 * appConfig/paywallPricing.trialAmount, falling back to env-configured
 * defaults so the feature works before any admin action.
 */
export async function getTrialAmount(): Promise<ResolvedPrice> {
  const stored = await getPaywallPricingDoc();
  return {
    amount: stored.trialAmount?.amount ?? env.trialAmount.amount,
    currency: stored.trialAmount?.currency ?? env.trialAmount.currency,
  };
}

/**
 * The Rs.299 recurring auto-debit amount — both the display price and the
 * actual charge amount for day-2/monthly auto-debits and "upgrade now".
 */
export async function getSubscriptionAmount(): Promise<ResolvedPrice> {
  const stored = await getPaywallPricingDoc();
  return {
    amount: stored.subscriptionAmount?.amount ?? env.subscriptionAmount.amount,
    currency: stored.subscriptionAmount?.currency ?? env.subscriptionAmount.currency,
  };
}

/**
 * "The price of 1 credit" — the single global number driving top-up
 * conversion and mandate-charge crediting alike.
 */
export async function getRupeesPerCredit(): Promise<number> {
  const stored = await getPaywallPricingDoc();
  return stored.creditPricing?.rupeesPerCredit ?? env.creditPricing.rupeesPerCredit;
}

export async function getReportPrice(): Promise<{ amount?: number; currency?: string }> {
  const stored = await getPaywallPricingDoc();
  return {
    amount: stored.report?.amount ?? env.reportPrice.amount,
    currency: stored.report?.currency ?? env.reportPrice.currency,
  };
}

export interface ResolvedTopUpConfig {
  minAmount: number;
  maxAmount: number;
  presetAmounts: number[];
  currency: string;
}

// Rupees, matching every amount this config exposes.
const DEFAULT_TOPUP_PRESETS_RUPEES = [50, 100, 200, 500, 1000, 2000];

/**
 * Wallet top-up limits, admin-editable via appConfig/paywallPricing.topUp,
 * falling back to env-configured defaults (see config/env.ts) so the feature
 * works before any admin action. All amounts here are Rupees — see
 * services/razorpay.service.ts's rupeesToPaise for the one place that
 * converts to Razorpay's required paise before calling their API.
 */
export async function getTopUpConfig(): Promise<ResolvedTopUpConfig> {
  const stored = await getPaywallPricingDoc();
  const topUp: TopUpConfig = stored.topUp ?? {};

  return {
    minAmount: topUp.minAmount ?? env.topUp.minAmount,
    maxAmount: topUp.maxAmount ?? env.topUp.maxAmount,
    presetAmounts: topUp.presetAmounts ?? DEFAULT_TOPUP_PRESETS_RUPEES,
    currency: topUp.currency ?? env.topUp.currency,
  };
}
