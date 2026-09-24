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

  let autoIdCounter = 0;

  function collection(name: CollectionName) {
    const predicates: Array<(d: Doc) => boolean> = [];
    const query = {
      doc: (id?: string) => docRef(name, id ?? `auto_${name}_${++autoIdCounter}`),
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
  paiseToRupees: (paise: number) => paise / 100,
}));

jest.mock('../controllers/payment.controller', () => ({ recordKundaliPayment: jest.fn() }));

jest.mock('./transactions.service', () => ({ recordTransaction: jest.fn(async () => undefined) }));

jest.mock('./mandate.service', () => ({ checkNewMandateStatus: jest.fn() }));

import { adminFirestore } from '../config/firebase-admin';
import { checkNewMandateStatus } from './mandate.service';
import { fetchOrderPayments } from './razorpay.service';
import { reconcilePayments } from './reconcile.service';
import { recordTransaction } from './transactions.service';

const mockAdminFirestore = adminFirestore as unknown as jest.Mock;
const mockFetchOrderPayments = fetchOrderPayments as unknown as jest.Mock;
const mockCheckNewMandateStatus = checkNewMandateStatus as unknown as jest.Mock;

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
    expect(recordTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: 'u1',
        paymentId: 'pay_1',
        orderId: 'order_1',
        purpose: 'topup',
        status: 'paid',
        amountRupees: 100,
        via: 'reconciliation',
      }),
    );

    // The order is now resolved, so a second run does not even ask Razorpay.
    const second = await reconcilePayments('u1');
    expect(second).toEqual({ resolved: [], pending: 0, mandateStatus: 'none' });
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

    expect(result).toEqual({ resolved: [], pending: 1, mandateStatus: 'none' });
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

    expect(result).toEqual({ resolved: [], pending: 0, mandateStatus: 'none' });
    expect(store.paymentOrders.order_old.status).toBe('expired');
  });

  it('ignores other users’ orders', async () => {
    const { db } = makeFakeFirestore({
      users: { u1: { credits: 0 } },
      paymentOrders: { order_2: { ...order('topup'), userId: 'someone_else' } },
    });
    mockAdminFirestore.mockReturnValue(db);

    const result = await reconcilePayments('u1');

    expect(result).toEqual({ resolved: [], pending: 0, mandateStatus: 'none' });
    expect(mockFetchOrderPayments).not.toHaveBeenCalled();
  });

  it('live-checks the mandate against Razorpay when the user has a subscription cycle', async () => {
    const { db } = makeFakeFirestore({
      users: { u1: { credits: 0, subscriptionId: 'sub_1' } },
    });
    mockAdminFirestore.mockReturnValue(db);
    mockCheckNewMandateStatus.mockResolvedValue('active');

    const result = await reconcilePayments('u1');

    expect(mockCheckNewMandateStatus).toHaveBeenCalledWith('u1', 'sub_1');
    expect(result.mandateStatus).toBe('active');
  });
});
