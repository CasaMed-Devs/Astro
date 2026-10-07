/**
 * Static details printed on every tax invoice. Kept on the backend (not in
 * the app bundle) so a change of registered address/GSTIN takes effect for
 * every app version at once, and so the tax split is never computed on a
 * device.
 */
export const INVOICE_SELLER = {
  brandName: 'HouseofTech',
  legalName: 'HouseofTech Innovation Pvt Ltd',
  addressLines: ['F-118, Adani Galeria, Sector 89A, Gurgaon', 'Haryana, India, 122505'],
  gstin: '06AALCP3434H1ZE',
  state: 'Haryana',
  stateCode: '06',
  supportEmail: 'support@houseoftech.ai',
} as const;

/** The product name shown in the invoice's "Service" block. */
export const INVOICE_APP_NAME = 'Astro108';

export const INVOICE_SAC = { code: '998439', description: 'Other on-line contents' } as const;

/**
 * Prices are GST-inclusive, and every sale is billed as intra-state from the
 * seller's own state (the app never collects a billing address), so the 18%
 * is always split into equal CGST and SGST halves.
 */
export const INVOICE_HALF_GST_RATE_PERCENT = 9;

/**
 * How long the paid trial lasts before the plan's first charge — must match
 * the `start_at` delay mandate.service.ts's startNewMandateSubscription
 * gives Razorpay.
 */
export const TRIAL_PERIOD_DAYS = 1;
