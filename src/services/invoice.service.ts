import { apiClient } from '@/services/apiClient';
import { toAppError } from '@/utils/errors';

export type InvoiceType = 'trial' | 'monthly';

// Mirrors functions/src/services/invoice.service.ts's Invoice — kept in sync
// by hand, like the types in src/types/firestore.ts.
export interface Invoice {
  id: string;
  invoiceNumber: string;
  type: InvoiceType;
  description: string;
  status: 'paid';
  paymentId: string;
  subscriptionId: string | null;
  paymentMethod: string | null;
  paidAt: string; // ISO
  periodStart: string; // ISO
  periodEnd: string; // ISO
  currency: string;
  // All Rupees, tax split computed by the backend.
  amount: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  halfGstRatePercent: number;
  customer: { name: string | null; phoneNumber: string };
  appName: string;
  sac: { code: string; description: string };
  seller: {
    brandName: string;
    legalName: string;
    addressLines: string[];
    gstin: string;
    state: string;
    stateCode: string;
    supportEmail: string;
  };
}

/** The signed-in user's subscription invoices (trial + monthly), newest first. */
export async function getInvoices(): Promise<Invoice[]> {
  try {
    const { invoices } = await apiClient.get<{ invoices: Invoice[] }>('/invoices');
    return invoices;
  } catch (error) {
    throw toAppError(error);
  }
}

export const invoicesQueryKey = (uid: string | undefined) => ['invoices', uid] as const;
