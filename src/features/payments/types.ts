export interface SubscriptionPlan {
  id: string;
  name: string;
  /** Left undefined until real pricing is decided — UI must render a "coming soon" state, never a fake price. */
  price?: number;
  currency?: string;
  billingPeriod: 'monthly' | 'yearly';
  trialDays?: number;
  features: string[];
  /** Populated once the plan is created in the Razorpay dashboard. */
  razorpayPlanId?: string;
}

export interface ReportUnlockOffer {
  id: string;
  name: string;
  price?: number;
  currency?: string;
}
