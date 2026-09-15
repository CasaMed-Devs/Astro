import { env } from './env';

export interface ServerSubscriptionPlan {
  id: string;
  amount?: number; // in the smallest currency unit (e.g. paise for INR)
  currency?: string;
}

/**
 * Server-side mirror of src/features/payments/config/plans.ts. Pricing is
 * read from env vars so it can be set without a redeploy of application
 * code — set SUBSCRIPTION_PRICE_AMOUNT/CURRENCY once real pricing exists.
 */
export function getServerPlan(planId: string): ServerSubscriptionPlan | undefined {
  if (planId !== 'astro101-plus-monthly') return undefined;

  const amount = process.env.SUBSCRIPTION_PRICE_AMOUNT
    ? Number(process.env.SUBSCRIPTION_PRICE_AMOUNT)
    : undefined;
  const currency = process.env.SUBSCRIPTION_PRICE_CURRENCY;

  return { id: planId, amount, currency };
}

export function getReportPrice(): { amount?: number; currency?: string } {
  return { amount: env.reportPrice.amount, currency: env.reportPrice.currency };
}
