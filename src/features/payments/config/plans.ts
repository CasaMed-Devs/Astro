import type { ReportUnlockOffer, SubscriptionPlan } from '@/features/payments/types';

/**
 * Pricing is intentionally unset (`price`/`currency`/`razorpayPlanId` are
 * `undefined`). Fill these in — and create the matching plan in the
 * Razorpay dashboard — before launch. The paywall UI renders a
 * "pricing coming soon" state whenever `price` is unset instead of
 * showing a fabricated number.
 */
export const subscriptionPlans: SubscriptionPlan[] = [
  {
    id: 'astro101-plus-monthly',
    name: 'Astro101 Plus',
    billingPeriod: 'monthly',
    trialDays: 7,
    features: [
      'Unlimited AI astrologer messages, no per-message credits',
      'Priority responses across all personas',
      'Unlimited kundali storage and saved reports',
    ],
  },
];

export const reportUnlockOffer: ReportUnlockOffer = {
  id: 'kundali-report-unlock',
  name: '40-page life report',
};

export function getDefaultPlan(): SubscriptionPlan {
  return subscriptionPlans[0];
}
