import { Timestamp } from 'firebase-admin/firestore';

// Real FieldValue sentinels are opaque SDK internals we can't easily inspect
// from a plain-object fake store, so replace them with tagged objects our
// fake's stripSentinels() below knows how to apply. Timestamp is left real.
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
type CollectionName = 'users' | 'payments' | 'subscriptions';

/**
 * Minimal in-memory Firestore fake supporting exactly what mandate.service
 * needs: doc get/set/update, simple where()-chained queries, and
 * runTransaction. Good enough to exercise the idempotency logic without a
 * real emulator.
 */
function makeFakeFirestore(initial: Partial<Record<CollectionName, Record<string, Doc>>>) {
  const store: Record<CollectionName, Record<string, Doc>> = {
    users: { ...(initial.users ?? {}) },
    payments: { ...(initial.payments ?? {}) },
    subscriptions: { ...(initial.subscriptions ?? {}) },
  };

  function stripSentinels(data: Doc, existing: Doc | undefined): Doc {
    const result: Doc = { ...data };
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && '__op' in (value as Record<string, unknown>)) {
        const op = (value as { __op: string; amount?: number }).__op;
        if (op === 'increment') {
          const current = Number((existing as Doc | undefined)?.[key] ?? 0);
          result[key] = current + Number((value as { amount: number }).amount);
        } else if (op === 'delete') {
          delete result[key];
        } else if (op === 'serverTimestamp') {
          result[key] = Timestamp.now();
        }
      }
    }
    return result;
  }

  function docRef(collectionName: CollectionName, id: string) {
    return {
      id,
      get: async () => ({
        exists: store[collectionName][id] !== undefined,
        id,
        data: () => store[collectionName][id],
        ref: docRef(collectionName, id),
      }),
      set: async (data: Doc, opts?: { merge?: boolean }) => {
        const clean = stripSentinels(data, store[collectionName][id]);
        store[collectionName][id] = opts?.merge
          ? { ...(store[collectionName][id] ?? {}), ...clean }
          : clean;
      },
      update: async (data: Doc) => {
        const clean = stripSentinels(data, store[collectionName][id]);
        store[collectionName][id] = { ...(store[collectionName][id] ?? {}), ...clean };
      },
    };
  }

  let autoIdCounter = 0;

  function collection(name: CollectionName) {
    return {
      doc: (id?: string) => docRef(name, id ?? `auto_${name}_${++autoIdCounter}`),
    };
  }

  const db = {
    collection,
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

jest.mock('./transactions.service', () => ({ recordTransaction: jest.fn(async () => undefined) }));

jest.mock('../config/plans', () => ({
  getTrialAmount: jest.fn(async () => ({ amount: 1, currency: 'INR' })),
  getSubscriptionAmount: jest.fn(async () => ({ amount: 299, currency: 'INR' })),
  getSubscriptionPlanId: jest.fn(async () => 'plan_test'),
  getRupeesPerCredit: jest.fn(async () => 1),
}));

jest.mock('./razorpay.service', () => ({
  createRecurringSubscription: jest.fn(),
  fetchSubscription: jest.fn(),
  cancelSubscription: jest.fn(),
  verifySubscriptionPaymentSignature: jest.fn(),
}));

describe('applyNewMandateEntitlement', () => {
  it('grants 5 trial credits exactly once, even if called twice with the same paymentId', async () => {
    const { db, store } = makeFakeFirestore({
      users: { uid1: { phoneNumber: '+911234567890', credits: 0, trialCreditsClaimed: false, subscriptionId: 'sub_1' } },
      subscriptions: { sub_1: { userId: 'uid1', planId: 'trial', status: 'authenticated' } },
    });
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const { applyNewMandateEntitlement } = await import('./mandate.service');

    await applyNewMandateEntitlement('uid1', 'sub_1', 'pay_1', { via: 'webhook' });
    await applyNewMandateEntitlement('uid1', 'sub_1', 'pay_1', { via: 'client_verify' }); // redelivered

    expect(store.users.uid1.credits).toBe(5); // +5 once, not +10
    expect(store.users.uid1.trialCreditsClaimed).toBe(true);
    expect(store.users.uid1.mandateStatus).toBe('active');
    expect(store.subscriptions.sub_1).toMatchObject({ status: 'active' });
  });

  it('credits the subscription amount worth of credits for a direct (non-trial) registration', async () => {
    const { db, store } = makeFakeFirestore({
      users: { uid1: { phoneNumber: '+911234567890', credits: 0, subscriptionId: 'sub_2' } },
      subscriptions: { sub_2: { userId: 'uid1', planId: 'plus', status: 'authenticated' } },
    });
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const { applyNewMandateEntitlement } = await import('./mandate.service');

    await applyNewMandateEntitlement('uid1', 'sub_2', 'pay_2', { via: 'webhook' });

    expect(store.users.uid1.credits).toBe(299); // Rs.299 at rupeesPerCredit=1
    expect(store.users.uid1.mandateStatus).toBe('active');
  });
});

describe('applyNewMandateRenewal', () => {
  it('credits the subscription amount and is idempotent per paymentId', async () => {
    const { db, store } = makeFakeFirestore({
      users: { uid1: { phoneNumber: '+911234567890', credits: 5, subscriptionId: 'sub_3' } },
      subscriptions: { sub_3: { userId: 'uid1', planId: 'plus', status: 'active' } },
    });
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const { applyNewMandateRenewal } = await import('./mandate.service');

    await applyNewMandateRenewal('uid1', 'sub_3', 'pay_3');
    await applyNewMandateRenewal('uid1', 'sub_3', 'pay_3'); // redelivered webhook

    expect(store.users.uid1.credits).toBe(304); // 5 + 299 once, not twice
  });
});

describe('checkNewMandateStatus', () => {
  it('credits the entitlement if Razorpay reports it captured but local state has not caught up', async () => {
    const { db, store } = makeFakeFirestore({
      users: { uid1: { phoneNumber: '+911234567890', credits: 0, subscriptionId: 'sub_4' } },
      subscriptions: { sub_4: { userId: 'uid1', planId: 'trial', status: 'created' } },
    });
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const razorpayService = await import('./razorpay.service');
    (razorpayService.fetchSubscription as jest.Mock).mockResolvedValue({ status: 'active' });
    const { checkNewMandateStatus } = await import('./mandate.service');

    const status = await checkNewMandateStatus('uid1', 'sub_4');

    expect(status).toBe('active');
    expect(store.users.uid1.credits).toBe(5);
    expect(store.users.uid1.mandateStatus).toBe('active');
  });

  it('does not re-credit an already-entitled cycle, just syncs status', async () => {
    const { db, store } = makeFakeFirestore({
      users: { uid1: { phoneNumber: '+911234567890', credits: 5, subscriptionId: 'sub_5' } },
      subscriptions: { sub_5: { userId: 'uid1', planId: 'trial', status: 'active' } },
    });
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const razorpayService = await import('./razorpay.service');
    (razorpayService.fetchSubscription as jest.Mock).mockResolvedValue({ status: 'active' });
    const { checkNewMandateStatus } = await import('./mandate.service');

    await checkNewMandateStatus('uid1', 'sub_5');

    expect(store.users.uid1.credits).toBe(5); // unchanged
  });

  it('throws if the subscription does not belong to the caller', async () => {
    const { db } = makeFakeFirestore({
      users: { uid1: { phoneNumber: '+911234567890', credits: 0 } },
      subscriptions: { sub_6: { userId: 'someone_else', planId: 'trial', status: 'created' } },
    });
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const { checkNewMandateStatus } = await import('./mandate.service');

    await expect(checkNewMandateStatus('uid1', 'sub_6')).rejects.toThrow();
  });
});
