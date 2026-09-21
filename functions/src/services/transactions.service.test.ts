import { Timestamp } from 'firebase-admin/firestore';

jest.mock('firebase-admin/firestore', () => {
  const actual = jest.requireActual('firebase-admin/firestore');
  return {
    ...actual,
    FieldValue: {
      increment: (amount: number) => ({ __op: 'increment', amount }),
      delete: () => ({ __op: 'delete' }),
      serverTimestamp: () => ({ __op: 'serverTimestamp' }),
    },
  };
});

type Doc = Record<string, unknown>;
type CollectionName = 'users' | 'transactions';

/** Minimal in-memory Firestore: doc get/set/update and transactions. */
function makeFakeFirestore(initial: { users?: Record<string, Doc>; transactions?: Record<string, Doc> }) {
  const store: Record<CollectionName, Record<string, Doc>> = {
    users: { ...(initial.users ?? {}) },
    transactions: { ...(initial.transactions ?? {}) },
  };

  function apply(data: Doc, existing: Doc | undefined): Doc {
    const result: Doc = { ...data };
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && '__op' in (value as Record<string, unknown>)) {
        const op = (value as { __op: string; amount?: number }).__op;
        if (op === 'increment') {
          result[key] = Number(existing?.[key] ?? 0) + Number((value as { amount: number }).amount);
        } else if (op === 'serverTimestamp') {
          result[key] = Timestamp.now();
        }
      }
    }
    return result;
  }

  function docRef(name: CollectionName, id: string) {
    return {
      id,
      get: async () => ({
        exists: store[name][id] !== undefined,
        id,
        data: () => store[name][id],
      }),
      set: async (data: Doc) => {
        store[name][id] = apply(data, undefined);
      },
      update: async (data: Doc) => {
        store[name][id] = { ...(store[name][id] ?? {}), ...apply(data, store[name][id]) };
      },
    };
  }

  const db = {
    collection: (name: CollectionName) => ({ doc: (id: string) => docRef(name, id) }),
    runTransaction: async (fn: (t: unknown) => Promise<unknown>) =>
      fn({
        get: async (ref: { get: () => Promise<unknown> }) => ref.get(),
        update: async (ref: { update: (d: Doc) => Promise<void> }, data: Doc) => ref.update(data),
        set: async (ref: { set: (d: Doc) => Promise<void> }, data: Doc) => ref.set(data),
      }),
  };

  return { db, store };
}

jest.mock('../config/firebase-admin', () => ({ adminFirestore: jest.fn() }));

import { adminFirestore } from '../config/firebase-admin';
import { recordTransaction } from './transactions.service';

const mockAdminFirestore = adminFirestore as unknown as jest.Mock;

const base = {
  uid: 'u1',
  purpose: 'topup' as const,
  status: 'paid' as const,
  amountRupees: 100,
  creditsAwarded: 100,
};

describe('recordTransaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates the first transaction with sequence 1 and bumps the user count', async () => {
    const { db, store } = makeFakeFirestore({ users: { u1: { credits: 0, mandateMethod: 'upi' } } });
    mockAdminFirestore.mockReturnValue(db);

    await recordTransaction({ ...base, paymentId: 'pay_1', orderId: 'order_1', via: 'client_verify' });

    expect(store.transactions.pay_1).toMatchObject({
      userId: 'u1',
      paymentId: 'pay_1',
      orderId: 'order_1',
      purpose: 'topup',
      status: 'paid',
      amount: 100,
      currency: 'INR',
      creditsAwarded: 100,
      paymentMethod: 'upi', // falls back to the user's stored method
      createdVia: 'client_verify',
      confirmedVia: ['client_verify'],
      sequence: 1,
    });
    expect(store.users.u1.transactionCount).toBe(1);
  });

  it('adds a second confirming channel to confirmedVia without a new doc or count bump', async () => {
    const { db, store } = makeFakeFirestore({ users: { u1: { credits: 0 } } });
    mockAdminFirestore.mockReturnValue(db);

    await recordTransaction({ ...base, paymentId: 'pay_1', via: 'webhook' });
    await recordTransaction({ ...base, paymentId: 'pay_1', via: 'reconciliation' });
    await recordTransaction({ ...base, paymentId: 'pay_1', via: 'reconciliation' });

    expect(Object.keys(store.transactions)).toEqual(['pay_1']);
    expect(store.transactions.pay_1).toMatchObject({
      createdVia: 'webhook',
      confirmedVia: ['webhook', 'reconciliation'],
      sequence: 1,
    });
    expect(store.users.u1.transactionCount).toBe(1);
  });

  it('numbers a user’s transactions in order', async () => {
    const { db, store } = makeFakeFirestore({ users: { u1: { credits: 0 } } });
    mockAdminFirestore.mockReturnValue(db);

    await recordTransaction({ ...base, paymentId: 'pay_1', via: 'client_verify' });
    await recordTransaction({ ...base, paymentId: 'pay_2', purpose: 'autodebit', via: 'auto_debit' });

    expect(store.transactions.pay_1.sequence).toBe(1);
    expect(store.transactions.pay_2).toMatchObject({ sequence: 2, createdVia: 'auto_debit' });
    expect(store.users.u1.transactionCount).toBe(2);
  });

  it('records a failed auto-debit and upgrades it if the same payment later shows as paid', async () => {
    const { db, store } = makeFakeFirestore({ users: { u1: { credits: 0 } } });
    mockAdminFirestore.mockReturnValue(db);

    await recordTransaction({
      ...base,
      paymentId: 'pay_f',
      purpose: 'autodebit',
      status: 'failed',
      creditsAwarded: 0,
      failureReason: 'Insufficient funds',
      via: 'webhook',
    });
    expect(store.transactions.pay_f).toMatchObject({
      status: 'failed',
      failureReason: 'Insufficient funds',
    });

    await recordTransaction({ ...base, paymentId: 'pay_f', purpose: 'autodebit', via: 'reconciliation' });
    expect(store.transactions.pay_f).toMatchObject({
      status: 'paid',
      failureReason: null,
      creditsAwarded: 100,
      confirmedVia: ['webhook', 'reconciliation'],
    });
    expect(store.users.u1.transactionCount).toBe(1);
  });

  it('never throws if Firestore fails', async () => {
    mockAdminFirestore.mockImplementation(() => {
      throw new Error('firestore down');
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      recordTransaction({ ...base, paymentId: 'pay_1', via: 'client_verify' }),
    ).resolves.toBeUndefined();

    warn.mockRestore();
  });
});
