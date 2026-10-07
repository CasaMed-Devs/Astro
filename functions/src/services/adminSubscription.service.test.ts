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
type Store = Record<string, Record<string, Doc>>;

/** Minimal in-memory Firestore: doc get/set/update/delete, add, equality where(), batches, transactions. */
function makeFakeFirestore(initial: Store) {
  const store: Store = {};
  for (const [name, docs] of Object.entries(initial)) store[name] = { ...docs };
  const docsOf = (name: string) => (store[name] ??= {});

  function apply(data: Doc, existing: Doc | undefined): Doc {
    const result: Doc = { ...data };
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && '__op' in (value as Record<string, unknown>)) {
        const op = (value as { __op: string }).__op;
        if (op === 'increment') {
          result[key] = Number(existing?.[key] ?? 0) + Number((value as unknown as { amount: number }).amount);
        } else if (op === 'serverTimestamp') {
          result[key] = Timestamp.now();
        }
      }
    }
    return result;
  }

  function merge(existing: Doc | undefined, data: Doc): Doc {
    const merged = { ...(existing ?? {}), ...apply(data, existing) };
    for (const [key, value] of Object.entries(merged)) {
      if ((value as { __op?: string } | null)?.__op === 'delete') delete merged[key];
    }
    return merged;
  }

  function docRef(name: string, id: string) {
    return {
      id,
      get: async () => ({ exists: docsOf(name)[id] !== undefined, id, data: () => docsOf(name)[id] }),
      set: async (data: Doc) => {
        docsOf(name)[id] = merge(undefined, data);
      },
      update: async (data: Doc) => {
        docsOf(name)[id] = merge(docsOf(name)[id], data);
      },
      delete: async () => {
        delete docsOf(name)[id];
      },
    };
  }
  type Ref = ReturnType<typeof docRef>;

  let autoId = 0;
  function collection(name: string) {
    const predicates: Array<(d: Doc) => boolean> = [];
    const query = {
      doc: (id?: string) => docRef(name, id ?? `auto_${++autoId}`),
      add: async (data: Doc) => docRef(name, `auto_${++autoId}`).set(data),
      where(field: string, _op: string, value: unknown) {
        predicates.push((d) => d[field] === value);
        return query;
      },
      get: async () => ({
        docs: Object.entries(docsOf(name))
          .filter(([, d]) => predicates.every((p) => p(d)))
          .map(([id, d]) => ({ id, data: () => d, ref: docRef(name, id) })),
      }),
    };
    return query;
  }

  const writer = {
    get: async (ref: Ref) => ref.get(),
    set: (ref: Ref, data: Doc) => ref.set(data),
    update: (ref: Ref, data: Doc) => ref.update(data),
    delete: (ref: Ref) => ref.delete(),
  };

  const db = {
    collection,
    runTransaction: async (fn: (t: typeof writer) => Promise<unknown>) => fn(writer),
    batch: () => ({ ...writer, commit: async () => undefined }),
  };

  return { db, store };
}

jest.mock('../config/firebase-admin', () => ({ adminFirestore: jest.fn() }));

jest.mock('./mandate.service', () => ({
  stopMandateForAdmin: jest.fn(async () => 'cancelled'),
  hasLiveAdminGrant: (user: { adminSubscription?: { expiresAt: Timestamp } } | undefined) =>
    Boolean(user?.adminSubscription && user.adminSubscription.expiresAt.toMillis() > Date.now()),
}));

import { adminFirestore } from '../config/firebase-admin';
import {
  expireSubscription,
  giveSubscription,
  resetSubscription,
  scheduleAction,
  settleAdminActionsForUser,
} from './adminSubscription.service';
import { stopMandateForAdmin } from './mandate.service';

const mockAdminFirestore = adminFirestore as unknown as jest.Mock;
const mockStopMandate = stopMandateForAdmin as unknown as jest.Mock;

const UID = '+919999999999';
const DAY_MS = 24 * 60 * 60 * 1000;
const NEXT_MONTH = new Date(Date.now() + 30 * DAY_MS);

function setup(initial: Store) {
  const fake = makeFakeFirestore(initial);
  mockAdminFirestore.mockReturnValue(fake.db);
  return fake.store;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('giveSubscription', () => {
  it('adds the credits on top of the existing balance and activates the subscription', async () => {
    const store = setup({ users: { [UID]: { credits: 100, mandateStatus: 'none' } } });

    const result = await giveSubscription(UID, NEXT_MONTH, 500, 'Asha');

    expect(result).toMatchObject({ previousCredits: 100, addedCredits: 500, newCredits: 600, subscriptionApplied: true });
    expect(store.users[UID]).toMatchObject({ credits: 600, mandateStatus: 'active' });
    expect((store.users[UID].adminSubscription as { grantedBy: string }).grantedBy).toBe('Asha');
    expect(Object.values(store.transactions)).toEqual([
      expect.objectContaining({ userId: UID, purpose: 'admin_grant', amount: 0, creditsAwarded: 500 }),
    ]);
    expect(Object.values(store.adminLogs)).toEqual([
      expect.objectContaining({ action: 'give_subscription', adminName: 'Asha', outcome: 'success' }),
    ]);
  });

  it('only adds credits when the user already pays for a subscription', async () => {
    const store = setup({ users: { [UID]: { credits: 10, mandateStatus: 'active', subscriptionId: 'sub_1' } } });

    const result = await giveSubscription(UID, NEXT_MONTH, 50, 'Asha');

    expect(result.subscriptionApplied).toBe(false);
    expect(store.users[UID].credits).toBe(60);
    expect(store.users[UID].adminSubscription).toBeUndefined();
  });

  it('rejects an unknown user and logs the failure', async () => {
    const store = setup({ users: {} });

    await expect(giveSubscription(UID, NEXT_MONTH, 50, 'Asha')).rejects.toThrow('No user found');
    expect(Object.values(store.adminLogs)).toEqual([expect.objectContaining({ outcome: 'failed' })]);
  });
});

describe('expireSubscription', () => {
  it('refuses a user with no active subscription', async () => {
    setup({ users: { [UID]: { credits: 5, mandateStatus: 'cancelled' } } });

    await expect(expireSubscription(UID, 'Asha')).rejects.toThrow('does not have an active subscription');
    expect(mockStopMandate).not.toHaveBeenCalled();
  });

  it('stops the auto-debit, then marks the user cancelled and keeps their credits', async () => {
    const store = setup({ users: { [UID]: { credits: 42, mandateStatus: 'active', subscriptionId: 'sub_1' } } });

    const result = await expireSubscription(UID, 'Asha');

    expect(mockStopMandate).toHaveBeenCalledWith(UID, 'sub_1');
    expect(result.autoDebitCancelled).toBe(true);
    expect(store.users[UID]).toMatchObject({ mandateStatus: 'cancelled', credits: 42, subscriptionId: 'sub_1' });
  });

  it('leaves the user active when Razorpay refuses to cancel', async () => {
    const store = setup({ users: { [UID]: { credits: 42, mandateStatus: 'active', subscriptionId: 'sub_1' } } });
    mockStopMandate.mockRejectedValueOnce(new Error('razorpay down'));

    await expect(expireSubscription(UID, 'Asha')).rejects.toThrow('razorpay down');
    expect(store.users[UID].mandateStatus).toBe('active');
  });
});

describe('resetSubscription', () => {
  it('returns the user to a never-subscribed state without touching their payment history', async () => {
    const store = setup({
      users: {
        [UID]: {
          credits: 300,
          mandateStatus: 'active',
          subscriptionId: 'sub_1',
          trialCreditsClaimed: true,
          kundaliUnlocked: true,
          userProfileId: 'profile_1',
        },
      },
      payments: { [`trial_credits_${UID}`]: { userId: UID }, pay_1: { userId: UID } },
      transactions: { pay_1: { userId: UID, purpose: 'trial' } },
    });

    const result = await resetSubscription(UID, 'Asha');

    expect(result).toMatchObject({ previousStatus: 'active', previousCredits: 300, autoDebitCancelled: true });
    expect(store.users[UID]).toMatchObject({
      credits: 0,
      mandateStatus: 'none',
      trialCreditsClaimed: false,
      kundaliUnlocked: true,
      userProfileId: 'profile_1',
    });
    expect(store.users[UID].subscriptionId).toBeUndefined();
    expect(store.payments[`trial_credits_${UID}`]).toBeUndefined();
    expect(store.payments.pay_1).toBeDefined();
    expect(store.transactions.pay_1).toBeDefined();
  });
});

describe('dated actions', () => {
  it('runs a scheduled expiry once its date has arrived, and not before', async () => {
    const store = setup({ users: { [UID]: { credits: 5, mandateStatus: 'active' } } });

    await scheduleAction('expire', UID, new Date(Date.now() + DAY_MS), 'Asha');
    await settleAdminActionsForUser(UID);
    expect(store.users[UID].mandateStatus).toBe('active');

    const [actionId] = Object.keys(store.adminScheduledActions);
    store.adminScheduledActions[actionId].runAt = Timestamp.fromMillis(Date.now() - 1000);
    await settleAdminActionsForUser(UID);

    expect(store.users[UID].mandateStatus).toBe('cancelled');
    expect(store.adminScheduledActions[actionId].status).toBe('done');
  });

  it('ends an admin-given subscription after its valid-until date', async () => {
    const store = setup({
      users: {
        [UID]: {
          credits: 5,
          mandateStatus: 'active',
          adminSubscription: {
            expiresAt: Timestamp.fromMillis(Date.now() - 1000),
            grantedAt: Timestamp.now(),
            grantedBy: 'Asha',
          },
        },
      },
    });

    await settleAdminActionsForUser(UID);

    expect(store.users[UID].mandateStatus).toBe('cancelled');
    expect(store.users[UID].adminSubscription).toBeUndefined();
    expect(store.users[UID].credits).toBe(5);
  });
});
