import { Timestamp } from 'firebase-admin/firestore';

jest.mock('../config/firebase-admin', () => ({ adminFirestore: jest.fn() }));

import { adminFirestore } from '../config/firebase-admin';
import {
  computeBillingPeriodEnd,
  computeGstBreakdown,
  formatInvoiceNumber,
  getInvoiceForTransaction,
  invoiceMonthKey,
} from './invoice.service';

const mockAdminFirestore = adminFirestore as unknown as jest.Mock;

type Doc = Record<string, unknown>;
type CollectionName = 'users' | 'transactions' | 'counters';

/** Minimal in-memory Firestore: doc get/set/update, a single-field where(), and transactions. */
function makeFakeFirestore(initial: Partial<Record<CollectionName, Record<string, Doc>>>) {
  const store: Record<CollectionName, Record<string, Doc>> = {
    users: { ...(initial.users ?? {}) },
    transactions: { ...(initial.transactions ?? {}) },
    counters: { ...(initial.counters ?? {}) },
  };

  function docRef(name: CollectionName, id: string) {
    return {
      id,
      get: async () => ({ exists: store[name][id] !== undefined, id, data: () => store[name][id] }),
      set: async (data: Doc, opts?: { merge?: boolean }) => {
        store[name][id] = opts?.merge ? { ...(store[name][id] ?? {}), ...data } : data;
      },
      update: async (data: Doc) => {
        store[name][id] = { ...(store[name][id] ?? {}), ...data };
      },
    };
  }

  const db = {
    collection: (name: CollectionName) => {
      const predicates: Array<(d: Doc) => boolean> = [];
      const query = {
        doc: (id: string) => docRef(name, id),
        where(field: string, _op: string, value: unknown) {
          predicates.push((d) => d[field] === value);
          return query;
        },
        get: async () => ({
          docs: Object.entries(store[name])
            .filter(([, d]) => predicates.every((p) => p(d)))
            .map(([id, d]) => ({ id, data: () => d })),
        }),
      };
      return query;
    },
    runTransaction: async (fn: (t: unknown) => Promise<unknown>) =>
      fn({
        get: async (ref: { get: () => Promise<unknown> }) => ref.get(),
        set: async (
          ref: { set: (d: Doc, o?: { merge?: boolean }) => Promise<void> },
          data: Doc,
          opts?: { merge?: boolean },
        ) => ref.set(data, opts),
        update: async (ref: { update: (d: Doc) => Promise<void> }, data: Doc) => ref.update(data),
      }),
  };

  return db;
}

describe('computeGstBreakdown', () => {
  it('matches the reference Rs 49 invoice', () => {
    expect(computeGstBreakdown(49)).toEqual({ taxableValue: 41.52, cgst: 3.74, sgst: 3.74 });
  });

  it.each([1, 49, 99, 299, 499.5])('adds back up to exactly Rs %p', (amount) => {
    const { taxableValue, cgst, sgst } = computeGstBreakdown(amount);
    expect(Math.round((taxableValue + cgst + sgst) * 100)).toBe(Math.round(amount * 100));
    expect(cgst).toBe(sgst);
  });
});

describe('invoice numbering', () => {
  it('formats a zero-padded per-month number', () => {
    expect(formatInvoiceNumber('202610', 1)).toBe('INV-202610-000001');
  });

  it('buckets a late-evening UTC payment into the next Indian month', () => {
    expect(invoiceMonthKey(new Date('2026-09-30T20:00:00Z'))).toBe('202610');
    expect(invoiceMonthKey(new Date('2026-09-30T10:00:00Z'))).toBe('202609');
  });
});

describe('computeBillingPeriodEnd', () => {
  it('ends a trial one day after it starts', () => {
    const end = computeBillingPeriodEnd('trial', new Date('2026-10-01T06:00:00Z'));
    expect(end.toISOString()).toBe('2026-10-02T06:00:00.000Z');
  });

  it('ends a monthly period on the same day next month', () => {
    const end = computeBillingPeriodEnd('monthly', new Date('2026-10-02T06:00:00Z'));
    expect(end.toISOString()).toBe('2026-11-02T06:00:00.000Z');
  });

  it('clamps to the end of a shorter month', () => {
    const end = computeBillingPeriodEnd('monthly', new Date('2027-01-31T06:00:00Z'));
    expect(end.toISOString()).toBe('2027-02-28T06:00:00.000Z');
  });

  it.each(['topup', 'report'] as const)('bills a one-off %s purchase as a single instant', (type) => {
    const start = new Date('2026-10-01T06:00:00Z');
    expect(computeBillingPeriodEnd(type, start).toISOString()).toBe(start.toISOString());
  });
});

describe('getInvoiceForTransaction', () => {
  const uid = 'uid_1';
  const users = { [uid]: { phoneNumber: '+919876543210' } };

  it('bills a wallet top-up, with the credit count in the description', async () => {
    mockAdminFirestore.mockReturnValue(
      makeFakeFirestore({
        users,
        transactions: {
          pay_1: {
            userId: uid,
            purpose: 'topup',
            status: 'paid',
            amount: 199,
            creditsAwarded: 200,
            createdAt: Timestamp.fromDate(new Date('2026-10-05T10:15:00Z')),
          },
        },
      }),
    );

    const invoice = await getInvoiceForTransaction(uid, 'pay_1');
    expect(invoice?.type).toBe('topup');
    expect(invoice?.description).toBe('Wallet Top-up (200 credits)');
    expect(invoice?.amount).toBe(199);
    expect(invoice?.periodStart).toBe(invoice?.periodEnd);
  });

  it('returns undefined for a failed payment — nothing was billed', async () => {
    mockAdminFirestore.mockReturnValue(
      makeFakeFirestore({
        users,
        transactions: {
          pay_2: {
            userId: uid,
            purpose: 'subscription',
            status: 'failed',
            amount: 299,
            createdAt: Timestamp.fromDate(new Date('2026-10-05T10:15:00Z')),
          },
        },
      }),
    );

    expect(await getInvoiceForTransaction(uid, 'pay_2')).toBeUndefined();
  });

  it('returns undefined for an admin-given credit grant — no money moved', async () => {
    mockAdminFirestore.mockReturnValue(
      makeFakeFirestore({
        users,
        transactions: {
          pay_3: {
            userId: uid,
            purpose: 'admin_grant',
            status: 'paid',
            amount: 0,
            createdAt: Timestamp.fromDate(new Date('2026-10-05T10:15:00Z')),
          },
        },
      }),
    );

    expect(await getInvoiceForTransaction(uid, 'pay_3')).toBeUndefined();
  });

  it("returns undefined when the transaction belongs to a different user", async () => {
    mockAdminFirestore.mockReturnValue(
      makeFakeFirestore({
        users,
        transactions: {
          pay_4: {
            userId: 'someone_else',
            purpose: 'topup',
            status: 'paid',
            amount: 199,
            createdAt: Timestamp.fromDate(new Date('2026-10-05T10:15:00Z')),
          },
        },
      }),
    );

    expect(await getInvoiceForTransaction(uid, 'pay_4')).toBeUndefined();
  });
});
