import { env } from './env';
import { getPaywallPricingDoc } from '../services/paywallPricing.service';

export interface ServerSubscriptionPlan {
  id: string;
  amount?: number; // in the smallest currency unit (e.g. paise for INR)
  currency?: string;
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

  return { id: planId, amount, currency };
}

export async function getReportPrice(): Promise<{ amount?: number; currency?: string }> {
  const stored = await getPaywallPricingDoc();
  return {
    amount: stored.report?.amount ?? env.reportPrice.amount,
    currency: stored.report?.currency ?? env.reportPrice.currency,
  };
}
