const LEGAL_BASE_URL = 'https://houseoftech-legal.web.app/astro108';

export const LEGAL_DOCS = {
  terms: { title: 'Terms and conditions', url: `${LEGAL_BASE_URL}/terms` },
  privacy: { title: 'Privacy policy', url: `${LEGAL_BASE_URL}/privacy` },
  'payment-cancellation': {
    title: 'Payment and cancellation policy',
    url: `${LEGAL_BASE_URL}/payment-cancellation`,
  },
  'delete-account': { title: 'Account deletion policy', url: `${LEGAL_BASE_URL}/delete-account` },
} as const;

export type LegalDocId = keyof typeof LEGAL_DOCS;
