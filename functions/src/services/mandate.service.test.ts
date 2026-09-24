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

/**
 * Minimal in-memory Firestore fake supporting exactly what mandate.service
 * needs: doc get/set/update, simple where()-chained queries, and
 * runTransaction. Good enough to exercise the idempotency and scheduling
 * logic without a real emulator.
 */
type CollectionName = 'users' | 'payments' | 'subscriptions' | 'failedCredits';

function makeFakeFirestore(initial: { users?: Record<string, Doc>; payments?: Record<string, Doc> }) {
  const store: Record<CollectionName, Record<string, Doc>> = {
    users: { ...(initial.users ?? {}) },
    payments: { ...(initial.payments ?? {}) },
    subscriptions: {},
    failedCredits: {},
  };

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

  let autoIdCounter = 0;

  function collection(name: CollectionName) {
    return {
      doc: (id?: string) => docRef(name, id ?? `auto_${name}_${++autoIdCounter}`),
      where(field: string, op: string, value: unknown) {
        const predicates: Array<(d: Doc) => boolean> = [
          (d) => {
            const fieldValue = d[field];
            if (op === '==') return fieldValue === value;
            if (op === '<=') {
              const a = fieldValue instanceof Timestamp ? fieldValue.toMillis() : fieldValue;
              const b = value instanceof Timestamp ? value.toMillis() : value;
              return typeof a === 'number' && typeof b === 'number' && a <= b;
            }
            return false;
          },
        ];
        const query = {
          _predicates: predicates,
          where(field2: string, op2: string, value2: unknown) {
            predicates.push((d: Doc) => {
              const fieldValue = d[field2];
              if (op2 === '==') return fieldValue === value2;
              if (op2 === '<=') {
                const a = fieldValue instanceof Timestamp ? fieldValue.toMillis() : fieldValue;
                const b = value2 instanceof Timestamp ? value2.toMillis() : value2;
                return typeof a === 'number' && typeof b === 'number' && a <= b;
              }
              return false;
            });
            return query;
          },
          get: async () => {
            const matches = Object.entries(store[name]).filter(([, d]) =>
              predicates.every((p) => p(d)),
            );
            return {
              docs: matches.map(([id, d]) => ({ id, data: () => d, ref: docRef(name, id) })),
              size: matches.length,
            };
          },
        };
        return query;
      },
    };
  }

  const db = {
    collection,
    runTransaction: async (fn: (t: unknown) => Promise<unknown>) => fn(makeTransaction()),
  };

  function makeTransaction() {
    return {
      get: async (ref: { get: () => Promise<unknown> }) => ref.get(),
      update: async (ref: { id: string; update: (d: Doc) => Promise<void> }, data: Doc) =>
        ref.update(data),
      set: async (
        ref: { id: string; set: (d: Doc, o?: { merge?: boolean }) => Promise<void> },
        data: Doc,
        opts?: { merge?: boolean },
      ) => ref.set(data, opts),
    };
  }

  return { db, store };
}

jest.mock('../config/firebase-admin', () => ({ adminFirestore: jest.fn() }));

jest.mock('./transactions.service', () => ({ recordTransaction: jest.fn(async () => undefined) }));

jest.mock('../config/plans', () => ({
  getTrialAmount: jest.fn(async () => ({ amount: 1, currency: 'INR' })),
  getSubscriptionAmount: jest.fn(async () => ({ amount: 299, currency: 'INR' })),
  getRupeesPerCredit: jest.fn(async () => 1),
}));

jest.mock('./razorpay.service', () => ({
  getOrCreateCustomer: jest.fn(async () => ({ customerId: 'cust_1' })),
  createRecurringRegistration: jest.fn(async () => ({
    registrationLinkId: 'link_1',
    shortUrl: 'https://rzp.io/link_1',
    customerId: 'cust_1',
  })),
  chargeRecurringToken: jest.fn(async () => ({ paymentId: 'pay_auto_1', orderId: 'order_1' })),
}));

describe('completeMandateRegistration (trial path)', () => {
  it('grants 5 credits and activates the mandate exactly once, even if called twice with the same paymentId', async () => {
    const { db, store } = makeFakeFirestore({
      users: { uid1: { phoneNumber: '+911234567890', credits: 10, trialCreditsClaimed: false } },
    });
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const { completeMandateRegistration } = await import('./mandate.service');

    await completeMandateRegistration('uid1', 'tok_1', 'pay_1', 'trial');
    await completeMandateRegistration('uid1', 'tok_1', 'pay_1', 'trial'); // redelivered webhook

    expect(store.users.uid1.credits).toBe(15); // +5 once, not +10
    expect(store.users.uid1.trialCreditsClaimed).toBe(true);
    // No prior startRegistration/startTrialOrder call in this test, so
    // completeMandateRegistration's self-healing path starts a fresh cycle
    // and points users.uid1.subscriptionId at it.
    const subscriptionId = store.users.uid1.subscriptionId as string;
    expect(subscriptionId).toBeTruthy();
    expect(store.subscriptions[subscriptionId]).toMatchObject({
      userId: 'uid1',
      planId: 'trial',
      status: 'active', // trial vs. paid is distinguished by planId, not a separate status
      razorpayTokenId: 'tok_1',
    });
    expect(store.users.uid1.mandateStatus).toBe('active');
    expect(store.users.uid1.razorpayTokenId).toBe('tok_1');
  });

  it('does not grant a second trial gift even via a different paymentId, once trialCreditsClaimed is true', async () => {
    const { db, store } = makeFakeFirestore({
      users: { uid1: { phoneNumber: '+911234567890', credits: 10, trialCreditsClaimed: true } },
    });
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const { completeMandateRegistration } = await import('./mandate.service');

    await completeMandateRegistration('uid1', 'tok_2', 'pay_2', 'trial');

    expect(store.users.uid1.credits).toBe(10); // unchanged — already claimed
  });
});

describe('completeMandateRegistration (direct_subscription path)', () => {
  it('credits the subscription amount worth of credits via the wallet ledger', async () => {
    const { db, store } = makeFakeFirestore({
      users: { uid1: { phoneNumber: '+911234567890', credits: 0, trialCreditsClaimed: true } },
    });
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const { completeMandateRegistration } = await import('./mandate.service');

    await completeMandateRegistration('uid1', 'tok_3', 'pay_3', 'direct_subscription');

    expect(store.users.uid1.credits).toBe(299); // Rs.299 at rupeesPerCredit=1
    expect(store.users.uid1.mandateStatus).toBe('active');
  });
});

describe('processDueAutoDebits', () => {
  it('charges a due mandate, credits the result, and advances the schedule by 30 days', async () => {
    const past = Timestamp.fromMillis(Date.now() - 1000);
    const { db, store } = makeFakeFirestore({
      users: {
        uid1: {
          phoneNumber: '+911234567890',
          credits: 5,
          mandateStatus: 'active',
          razorpayCustomerId: 'cust_1',
          razorpayTokenId: 'tok_1',
          nextAutoDebitAt: past,
          nextAutoDebitAmount: 299,
        },
      },
    });
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const { processDueAutoDebits } = await import('./mandate.service');

    const result = await processDueAutoDebits();

    expect(result).toEqual({ charged: 1, failed: 0 });
    expect(store.users.uid1.credits).toBe(304); // 5 + 299
    expect(store.users.uid1.graceUntil).toBeUndefined();
  });

  it('opens a grace period without touching credits when the charge throws', async () => {
    const past = Timestamp.fromMillis(Date.now() - 1000);
    const { db, store } = makeFakeFirestore({
      users: {
        uid1: {
          phoneNumber: '+911234567890',
          credits: 5,
          mandateStatus: 'active',
          razorpayCustomerId: 'cust_1',
          razorpayTokenId: 'tok_1',
          nextAutoDebitAt: past,
          nextAutoDebitAmount: 299,
        },
      },
    });
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const razorpayService = await import('./razorpay.service');
    (razorpayService.chargeRecurringToken as jest.Mock).mockRejectedValueOnce(
      new Error('card declined'),
    );
    const { processDueAutoDebits } = await import('./mandate.service');

    const result = await processDueAutoDebits();

    expect(result).toEqual({ charged: 0, failed: 1 });
    expect(store.users.uid1.credits).toBe(5); // untouched
    expect(store.users.uid1.graceUntil).toBeDefined();
    expect(store.users.uid1.lastPaymentFailureReason).toBe('card declined');
  });

  it('never opens a grace period or leaves the schedule unmoved when the charge succeeds but crediting then fails', async () => {
    // This is the money-safety case: Razorpay has already taken the payment
    // by the time chargeRecurringToken resolves. A bookkeeping failure after
    // that (recordTransaction throwing here) must NOT look like a failed
    // charge — that would wrongly grace-period a user who already paid, and
    // (critically) leave nextAutoDebitAt unmoved, which would make the next
    // hourly run charge them a second time for the same cycle.
    const past = Timestamp.fromMillis(Date.now() - 1000);
    const { db, store } = makeFakeFirestore({
      users: {
        uid1: {
          phoneNumber: '+911234567890',
          credits: 5,
          mandateStatus: 'active',
          razorpayCustomerId: 'cust_1',
          razorpayTokenId: 'tok_1',
          nextAutoDebitAt: past,
          nextAutoDebitAmount: 299,
        },
      },
    });
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const transactionsService = await import('./transactions.service');
    (transactionsService.recordTransaction as jest.Mock).mockRejectedValueOnce(
      new Error('firestore hiccup'),
    );
    const { processDueAutoDebits } = await import('./mandate.service');

    const result = await processDueAutoDebits();

    expect(result).toEqual({ charged: 0, failed: 1 });
    // Not a "failed charge" — no grace period opened, no failure reason on the user.
    expect(store.users.uid1.graceUntil).toBeUndefined();
    expect(store.users.uid1.lastPaymentFailureReason).toBeUndefined();
    // The schedule was still advanced, so the next hourly run won't charge again.
    expect((store.users.uid1.nextAutoDebitAt as Timestamp).toMillis()).toBeGreaterThan(past.toMillis());
    // The successful charge is durably recorded for manual reconciliation.
    expect(store.failedCredits.pay_auto_1).toMatchObject({
      userId: 'uid1',
      paymentId: 'pay_auto_1',
      amountRupees: 299,
      resolved: false,
    });
  });
});
