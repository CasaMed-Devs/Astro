import { env } from './env';
import { getPaywallPricingDoc, type TopUpConfig } from '../services/paywallPricing.service';

export interface ServerSubscriptionPlan {
  id: string;
  amount?: number; // Rupees — display only, the actual charge is set on the Razorpay Plan itself
  currency?: string;
  razorpayPlanId?: string;
}

/**
 * Server-side mirror of src/features/payments/config/plans.ts. Pricing is
 * read from the admin-editable appConfig/paywallPricing doc first, falling
 * back to env vars (SUBSCRIPTION_PRICE_AMOUNT/CURRENCY) so a fresh deploy
 * still has working prices before any admin action.
 */
export async function getServerPlan(planId: string): Promise<ServerSubscriptionPlan | undefined> {
  if (planId !== 'astro101-plus-monthly') return undefined;

  const stored = await getPaywallPricingDoc();
  const amount =
    stored.subscription?.amount ??
    (process.env.SUBSCRIPTION_PRICE_AMOUNT
      ? Number(process.env.SUBSCRIPTION_PRICE_AMOUNT)
      : undefined);
  const currency = stored.subscription?.currency ?? process.env.SUBSCRIPTION_PRICE_CURRENCY;
  const razorpayPlanId = stored.subscription?.razorpayPlanId ?? env.razorpay.planId;

  return { id: planId, amount, currency, razorpayPlanId };
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
  creditsPerRupee: number;
  presetAmounts: number[];
  currency: string;
}

// Rupees, matching every amount this config exposes.
const DEFAULT_TOPUP_PRESETS_RUPEES = [50, 100, 200, 500, 1000, 2000];

/**
 * Wallet top-up limits/rate, admin-editable via appConfig/paywallPricing.topUp,
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
    creditsPerRupee: topUp.creditsPerRupee ?? env.topUp.creditsPerRupee,
    presetAmounts: topUp.presetAmounts ?? DEFAULT_TOPUP_PRESETS_RUPEES,
    currency: topUp.currency ?? env.topUp.currency,
  };
}
