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
type CollectionName = 'users' | 'payments' | 'subscriptions' | 'paymentOrders';

/** Minimal in-memory Firestore: doc get/set/update, equality where(), transactions. */
function makeFakeFirestore(initial: Partial<Record<CollectionName, Record<string, Doc>>>) {
  const store: Record<CollectionName, Record<string, Doc>> = {
    users: { ...(initial.users ?? {}) },
    payments: { ...(initial.payments ?? {}) },
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
        } else if (op === 'delete') {
          delete result[key];
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
        ref: docRef(name, id),
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

  function collection(name: CollectionName) {
    const predicates: Array<(d: Doc) => boolean> = [];
    const query = {
      doc: (id: string) => docRef(name, id),
      where(field: string, _op: string, value: unknown) {
        predicates.push((d) => d[field] === value);
        return query;
      },
      limit: () => query,
      get: async () => {
        const matches = Object.entries(store[name]).filter(([, d]) => predicates.every((p) => p(d)));
        return {
          docs: matches.map(([id, d]) => ({ id, data: () => d, ref: docRef(name, id) })),
          size: matches.length,
        };
      },
    };
    return query;
  }

  const db = {
    collection: (name: CollectionName) => collection(name),
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

jest.mock('../config/plans', () => ({
  getTrialAmount: jest.fn(async () => ({ amount: 1, currency: 'INR' })),
  getSubscriptionAmount: jest.fn(async () => ({ amount: 299, currency: 'INR' })),
  getRupeesPerCredit: jest.fn(async () => 1),
}));

jest.mock('./razorpay.service', () => ({
  fetchOrderPayments: jest.fn(),
  findMandateTokenId: jest.fn(),
  paiseToRupees: (paise: number) => paise / 100,
}));

jest.mock('../controllers/payment.controller', () => ({ recordKundaliPayment: jest.fn() }));

import { adminFirestore } from '../config/firebase-admin';
import { fetchOrderPayments } from './razorpay.service';
import { reconcilePayments } from './reconcile.service';

const mockAdminFirestore = adminFirestore as unknown as jest.Mock;
const mockFetchOrderPayments = fetchOrderPayments as unknown as jest.Mock;

const DAY_MS = 24 * 60 * 60 * 1000;

function order(purpose: string, ageMs = 60_000, status = 'created'): Doc {
  return {
    userId: 'u1',
    purpose,
    status,
    amountPaise: 10000,
    createdAt: Timestamp.fromMillis(Date.now() - ageMs),
  };
}

describe('reconcilePayments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('credits a captured top-up the client and webhook both missed, exactly once', async () => {
    const { db, store } = makeFakeFirestore({
      users: { u1: { credits: 0 } },
      paymentOrders: { order_1: order('topup') },
    });
    mockAdminFirestore.mockReturnValue(db);
    mockFetchOrderPayments.mockResolvedValue([{ id: 'pay_1', status: 'captured', amount: 10000 }]);

    const first = await reconcilePayments('u1');
    expect(first.resolved).toEqual([{ purpose: 'topup', orderId: 'order_1' }]);
    expect(store.users.u1.credits).toBe(100);
    expect(store.payments.pay_1).toMatchObject({ purpose: 'topup', creditsAwarded: 100 });
    expect(store.paymentOrders.order_1).toMatchObject({ status: 'paid', resolvedVia: 'reconciliation' });

    // The order is now resolved, so a second run does not even ask Razorpay.
    const second = await reconcilePayments('u1');
    expect(second).toEqual({ resolved: [], pending: 0 });
    expect(store.users.u1.credits).toBe(100);
    expect(mockFetchOrderPayments).toHaveBeenCalledTimes(1);
  });

  it('does not double-credit when the client verify or webhook already credited the payment', async () => {
    const { db, store } = makeFakeFirestore({
      users: { u1: { credits: 100 } },
      payments: { pay_1: { userId: 'u1', purpose: 'topup', creditsAwarded: 100 } },
      paymentOrders: { order_1: order('topup') },
    });
    mockAdminFirestore.mockReturnValue(db);
    mockFetchOrderPayments.mockResolvedValue([{ id: 'pay_1', status: 'captured', amount: 10000 }]);

    const result = await reconcilePayments('u1');

    expect(result.resolved).toHaveLength(1);
    expect(store.users.u1.credits).toBe(100);
    expect(store.paymentOrders.order_1.status).toBe('paid');
  });

  it('leaves an order with no captured payment pending', async () => {
    const { db, store } = makeFakeFirestore({
      users: { u1: { credits: 0 } },
      paymentOrders: { order_1: order('topup') },
    });
    mockAdminFirestore.mockReturnValue(db);
    mockFetchOrderPayments.mockResolvedValue([{ id: 'pay_1', status: 'failed', amount: 10000 }]);

    const result = await reconcilePayments('u1');

    expect(result).toEqual({ resolved: [], pending: 1 });
    expect(store.paymentOrders.order_1.status).toBe('created');
    expect(store.users.u1.credits).toBe(0);
  });

  it('expires an old order that was never paid', async () => {
    const { db, store } = makeFakeFirestore({
      users: { u1: { credits: 0 } },
      paymentOrders: { order_old: order('topup', 8 * DAY_MS) },
    });
    mockAdminFirestore.mockReturnValue(db);
    mockFetchOrderPayments.mockResolvedValue([]);

    const result = await reconcilePayments('u1');

    expect(result).toEqual({ resolved: [], pending: 0 });
    expect(store.paymentOrders.order_old.status).toBe('expired');
  });

  it('ignores other users’ orders', async () => {
    const { db } = makeFakeFirestore({
      users: { u1: { credits: 0 } },
      paymentOrders: { order_2: { ...order('topup'), userId: 'someone_else' } },
    });
    mockAdminFirestore.mockReturnValue(db);

    const result = await reconcilePayments('u1');

    expect(result).toEqual({ resolved: [], pending: 0 });
    expect(mockFetchOrderPayments).not.toHaveBeenCalled();
  });

  it('completes a trial mandate registration and grants the trial credits once', async () => {
    const { db, store } = makeFakeFirestore({
      users: { u1: { credits: 0, razorpayCustomerId: 'cust_1', mandateStatus: 'pending' } },
      paymentOrders: { order_t: order('trial') },
    });
    mockAdminFirestore.mockReturnValue(db);
    mockFetchOrderPayments.mockResolvedValue([
      { id: 'pay_t', status: 'captured', amount: 100, token_id: 'token_1' },
    ]);

    const result = await reconcilePayments('u1');

    expect(result.resolved).toEqual([{ purpose: 'trial', orderId: 'order_t' }]);
    expect(store.users.u1).toMatchObject({
      mandateStatus: 'active',
      razorpayTokenId: 'token_1',
      trialCreditsClaimed: true,
      credits: 5,
    });
    expect(store.payments.registration_pay_t).toBeDefined();
  });
});
