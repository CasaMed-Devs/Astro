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
type CollectionName = 'users' | 'transactions' | 'subscriptions' | 'paymentOrders';

/** Minimal in-memory Firestore: doc get/set/update and transactions. */
function makeFakeFirestore(initial: Partial<Record<CollectionName, Record<string, Doc>>>) {
  const store: Record<CollectionName, Record<string, Doc>> = {
    users: { ...(initial.users ?? {}) },
    transactions: { ...(initial.transactions ?? {}) },
    subscriptions: { ...(initial.subscriptions ?? {}) },
    paymentOrders: { ...(initial.paymentOrders ?? {}) },
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
      set: async (data: Doc, opts?: { merge?: boolean }) => {
        const clean = apply(data, store[name][id]);
        store[name][id] = opts?.merge ? { ...(store[name][id] ?? {}), ...clean } : clean;
      },
      update: async (data: Doc) => {
        store[name][id] = { ...(store[name][id] ?? {}), ...apply(data, store[name][id]) };
      },
    };
  }

  let autoIdCounter = 0;

  const db = {
    collection: (name: CollectionName) => ({
      doc: (id?: string) => docRef(name, id ?? `auto_${name}_${++autoIdCounter}`),
    }),
    runTransaction: async (fn: (t: unknown) => Promise<unknown>) =>
      fn({
        get: async (ref: { get: () => Promise<unknown> }) => ref.get(),
        update: async (ref: { update: (d: Doc) => Promise<void> }, data: Doc) => ref.update(data),
        set: async (
          ref: { set: (d: Doc, o?: { merge?: boolean }) => Promise<void> },
          data: Doc,
          opts?: { merge?: boolean },
        ) => ref.set(data, opts),
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

  it('links user -> subscription -> transaction for a subscription payment', async () => {
    // subscriptionId is set here as mandate.service.ts's startSubscriptionCycle
    // would have already done, before any transaction is ever recorded —
    // recordTransaction only follows this pointer, it never sets it.
    const { db, store } = makeFakeFirestore({
      users: { u1: { credits: 0, subscriptionId: 'sub_cycle_1' } },
      subscriptions: { sub_cycle_1: { userId: 'u1' } },
    });
    mockAdminFirestore.mockReturnValue(db);

    await recordTransaction({ ...base, paymentId: 'pay_s', purpose: 'subscription', via: 'client_verify' });

    expect(store.transactions.pay_s).toMatchObject({ userId: 'u1', subscriptionId: 'sub_cycle_1' });
    // recordTransaction never touches users.subscriptionId — mandate.service.ts owns it.
    expect(store.users.u1).toMatchObject({ subscriptionId: 'sub_cycle_1', lastTransactionId: 'pay_s' });
    expect(store.subscriptions.sub_cycle_1).toMatchObject({ userId: 'u1', lastTransactionId: 'pay_s' });
  });

  it('does not write a subscription pointer when the user has no subscription cycle yet', async () => {
    const { db, store } = makeFakeFirestore({ users: { u1: { credits: 0 } } });
    mockAdminFirestore.mockReturnValue(db);

    await recordTransaction({ ...base, paymentId: 'pay_s2', purpose: 'subscription', via: 'client_verify' });

    expect(store.transactions.pay_s2).toMatchObject({ userId: 'u1', subscriptionId: null });
    expect(Object.keys(store.subscriptions)).toHaveLength(0);
  });

  it('does not link a one-off top-up to the subscription', async () => {
    const { db, store } = makeFakeFirestore({ users: { u1: { credits: 0 } } });
    mockAdminFirestore.mockReturnValue(db);

    await recordTransaction({ ...base, paymentId: 'pay_t', via: 'client_verify' });

    expect(store.transactions.pay_t.subscriptionId).toBeNull();
    expect(store.users.u1.lastTransactionId).toBe('pay_t');
    expect(store.users.u1.subscriptionId).toBeUndefined();
    expect(store.subscriptions.u1).toBeUndefined();
  });

  it('does not move the subscription pointer for a failed charge', async () => {
    const { db, store } = makeFakeFirestore({
      users: { u1: { credits: 0, subscriptionId: 'sub_cycle_1' } },
      subscriptions: { sub_cycle_1: { userId: 'u1', lastTransactionId: 'pay_ok' } },
    });
    mockAdminFirestore.mockReturnValue(db);

    await recordTransaction({
      ...base,
      paymentId: 'pay_bad',
      purpose: 'autodebit',
      status: 'failed',
      creditsAwarded: 0,
      via: 'webhook',
    });

    expect(store.subscriptions.sub_cycle_1.lastTransactionId).toBe('pay_ok');
    expect(store.users.u1.lastTransactionId).toBe('pay_bad');
  });

  it('points the order back at its transaction', async () => {
    const { db, store } = makeFakeFirestore({
      users: { u1: { credits: 0 } },
      paymentOrders: { order_1: { userId: 'u1', status: 'created' } },
    });
    mockAdminFirestore.mockReturnValue(db);

    await recordTransaction({ ...base, paymentId: 'pay_1', orderId: 'order_1', via: 'client_verify' });

    expect(store.paymentOrders.order_1).toMatchObject({ userId: 'u1', transactionId: 'pay_1' });
  });

  it('refuses to create an orphan transaction for a user that does not exist', async () => {
    const { db, store } = makeFakeFirestore({});
    mockAdminFirestore.mockReturnValue(db);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await recordTransaction({ ...base, paymentId: 'pay_1', via: 'client_verify' });

    expect(store.transactions.pay_1).toBeUndefined();
    warn.mockRestore();
  });

  it('refuses to link a payment to an order that belongs to another user', async () => {
    const { db, store } = makeFakeFirestore({
      users: { u1: { credits: 0 } },
      paymentOrders: { order_x: { userId: 'someone_else', status: 'created' } },
    });
    mockAdminFirestore.mockReturnValue(db);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await recordTransaction({ ...base, paymentId: 'pay_1', orderId: 'order_x', via: 'webhook' });

    expect(store.transactions.pay_1).toBeUndefined();
    expect(store.users.u1.transactionCount).toBeUndefined();
    expect(store.paymentOrders.order_x.transactionId).toBeUndefined();
    warn.mockRestore();
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
