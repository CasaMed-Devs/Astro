import { FieldValue, type Timestamp } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';
import {
  INVOICE_APP_NAME,
  INVOICE_HALF_GST_RATE_PERCENT,
  INVOICE_SAC,
  INVOICE_SELLER,
  TRIAL_PERIOD_DAYS,
} from '../config/invoice';
import { getUserProfile } from './userProfile.service';
import type { TransactionPurpose } from './transactions.service';
import { NotFoundError } from '../utils/errors';
import type { UserProfileRecord } from '../types';

export type InvoiceType = 'trial' | 'monthly' | 'topup' | 'report';

// Every paid transaction purpose gets its own invoice type, so a wallet
// top-up or a kundali unlock is billed under its own description instead of
// falling out of the list (or inheriting whatever type came before it).
const INVOICE_TYPE_BY_PURPOSE: Partial<Record<TransactionPurpose, InvoiceType>> = {
  trial: 'trial',
  subscription: 'monthly',
  direct_subscription: 'monthly',
  autodebit: 'monthly',
  topup: 'topup',
  report: 'report',
};

const INVOICE_DESCRIPTION: Record<InvoiceType, string> = {
  trial: 'Trial Subscription',
  monthly: 'Monthly Subscription',
  topup: 'Wallet Top-up',
  report: 'Kundali Report Unlock',
};

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export interface Invoice {
  id: string; // transactions/{id} — the Razorpay payment id
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
  // All Rupees. taxableValue + cgst + sgst always equals amount exactly.
  amount: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  halfGstRatePercent: number;
  customer: { name: string | null; phoneNumber: string };
  appName: string;
  sac: { code: string; description: string };
  seller: typeof INVOICE_SELLER;
}

export interface GstBreakdown {
  taxableValue: number;
  cgst: number;
  sgst: number;
}

/**
 * Splits a GST-inclusive amount into its taxable value and the two equal tax
 * halves. Each half is rounded to the paisa first and the taxable value takes
 * the remainder, so the three lines always add back up to exactly what the
 * customer paid.
 */
export function computeGstBreakdown(amountRupees: number): GstBreakdown {
  const amountPaise = Math.round(amountRupees * 100);
  const halfTaxPaise = Math.round(
    (amountPaise * INVOICE_HALF_GST_RATE_PERCENT) / (100 + 2 * INVOICE_HALF_GST_RATE_PERCENT),
  );
  return {
    taxableValue: (amountPaise - 2 * halfTaxPaise) / 100,
    cgst: halfTaxPaise / 100,
    sgst: halfTaxPaise / 100,
  };
}

/** "202610" for any instant in October 2026, Indian time. */
export function invoiceMonthKey(paidAt: Date): string {
  const ist = new Date(paidAt.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}${String(ist.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function formatInvoiceNumber(monthKey: string, sequence: number): string {
  return `INV-${monthKey}-${String(sequence).padStart(6, '0')}`;
}

export function computeBillingPeriodEnd(type: InvoiceType, start: Date): Date {
  if (type === 'trial') return new Date(start.getTime() + TRIAL_PERIOD_DAYS * DAY_MS);
  // One-off purchases (credits, report unlock) bill a single instant, not a cycle.
  if (type !== 'monthly') return new Date(start.getTime());

  const end = new Date(start.getTime());
  end.setUTCMonth(end.getUTCMonth() + 1);
  // 31 Jan + 1 month overflows into March; clamp back to the last day of Feb.
  if (end.getUTCDate() !== start.getUTCDate()) end.setUTCDate(0);
  return end;
}

/**
 * Gives a transaction its invoice number the first time its invoice is
 * requested, from a per-month counter. Atomic and idempotent: two concurrent
 * requests can neither hand out the same number twice nor number the same
 * payment twice.
 */
async function assignInvoiceNumber(transactionId: string, paidAt: Date): Promise<string> {
  const db = adminFirestore();
  const txRef = db.collection('transactions').doc(transactionId);
  const monthKey = invoiceMonthKey(paidAt);
  const counterRef = db.collection('counters').doc(`invoices_${monthKey}`);

  return db.runTransaction(async (transaction) => {
    const [txSnapshot, counterSnapshot] = await Promise.all([
      transaction.get(txRef),
      transaction.get(counterRef),
    ]);

    const existing = txSnapshot.data()?.invoiceNumber as string | undefined;
    if (existing) return existing;

    const sequence = Number(counterSnapshot.data()?.lastNumber ?? 0) + 1;
    const invoiceNumber = formatInvoiceNumber(monthKey, sequence);

    transaction.set(
      counterRef,
      { lastNumber: sequence, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    transaction.update(txRef, {
      invoiceNumber,
      invoiceIssuedAt: FieldValue.serverTimestamp(),
    });
    return invoiceNumber;
  });
}

interface StoredTransaction {
  purpose?: TransactionPurpose;
  status?: string;
  amount?: number;
  currency?: string;
  subscriptionId?: string | null;
  paymentMethod?: string | null;
  invoiceNumber?: string;
  createdAt?: Timestamp;
  creditsAwarded?: number;
}

/** "Wallet Top-up (100 credits)" for a top-up; the plain type description otherwise. */
function describeInvoice(type: InvoiceType, creditsAwarded?: number): string {
  if (type === 'topup' && creditsAwarded) {
    return `${INVOICE_DESCRIPTION[type]} (${creditsAwarded} credits)`;
  }
  return INVOICE_DESCRIPTION[type];
}

/** `undefined` when this transaction isn't one that gets billed (unpaid, zero-value, or not a purpose we invoice). */
function invoicableEntry(
  id: string,
  data: StoredTransaction,
): { id: string; data: StoredTransaction; type: InvoiceType; paidAt: Date; amount: number } | undefined {
  const type = data.purpose ? INVOICE_TYPE_BY_PURPOSE[data.purpose] : undefined;
  const paidAt = data.createdAt?.toDate?.();
  const amount = Number(data.amount ?? 0);
  if (!type || !paidAt || data.status !== 'paid' || amount <= 0) return undefined;
  return { id, data, type, paidAt, amount };
}

async function buildInvoice(
  entry: { id: string; data: StoredTransaction; type: InvoiceType; paidAt: Date; amount: number },
  customer: { name: string | null; phoneNumber: string },
): Promise<Invoice> {
  const { id, data, type, paidAt, amount } = entry;
  const invoiceNumber = data.invoiceNumber ?? (await assignInvoiceNumber(id, paidAt));
  return {
    id,
    invoiceNumber,
    type,
    description: describeInvoice(type, data.creditsAwarded),
    status: 'paid',
    paymentId: id,
    subscriptionId: data.subscriptionId ?? null,
    paymentMethod: data.paymentMethod ?? null,
    paidAt: paidAt.toISOString(),
    periodStart: paidAt.toISOString(),
    periodEnd: computeBillingPeriodEnd(type, paidAt).toISOString(),
    currency: data.currency ?? 'INR',
    amount,
    ...computeGstBreakdown(amount),
    halfGstRatePercent: INVOICE_HALF_GST_RATE_PERCENT,
    customer,
    appName: INVOICE_APP_NAME,
    sac: INVOICE_SAC,
    seller: INVOICE_SELLER,
  };
}

async function customerOf(uid: string): Promise<{ name: string | null; phoneNumber: string }> {
  const db = adminFirestore();
  const userSnapshot = await db.collection('users').doc(uid).get();
  if (!userSnapshot.exists) throw new NotFoundError('User profile not found.');

  const user = userSnapshot.data() as UserProfileRecord;
  const profile = user.userProfileId ? await getUserProfile(user.userProfileId) : undefined;
  return { name: profile?.name?.trim() || null, phoneNumber: user.phoneNumber ?? uid };
}

/** The signed-in user's paid invoices (trial, monthly, top-ups, report unlocks), newest first. */
export async function listInvoices(uid: string): Promise<Invoice[]> {
  const db = adminFirestore();
  // Filtered and sorted in memory rather than in the query: a user only ever
  // has a handful of transactions, and this way no composite index is needed.
  const [customer, transactionsSnapshot] = await Promise.all([
    customerOf(uid),
    db.collection('transactions').where('userId', '==', uid).get(),
  ]);

  const billable = transactionsSnapshot.docs
    .map((doc) => invoicableEntry(doc.id, doc.data() as StoredTransaction))
    .filter((entry) => entry !== undefined)
    .sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());

  const invoices: Invoice[] = [];
  // Sequential and oldest-first so a user's numbers follow their payment order.
  for (const entry of billable) {
    invoices.push(await buildInvoice(entry, customer));
  }

  return invoices.reverse();
}

/**
 * The one invoice for a specific transaction, for support to pull up during a
 * payment dispute. `undefined` when that transaction was never billed (a
 * failed payment, or an admin-given grant — see dispute data's own listing
 * for those).
 */
export async function getInvoiceForTransaction(uid: string, transactionId: string): Promise<Invoice | undefined> {
  const db = adminFirestore();
  const [customer, txSnapshot] = await Promise.all([
    customerOf(uid),
    db.collection('transactions').doc(transactionId).get(),
  ]);
  if (!txSnapshot.exists) return undefined;

  const data = txSnapshot.data() as StoredTransaction & { userId?: string };
  if (data.userId !== uid) return undefined;

  const entry = invoicableEntry(transactionId, data);
  if (!entry) return undefined;

  return buildInvoice(entry, customer);
}
