jest.mock('firebase-admin/firestore', () => {
  const actual = jest.requireActual('firebase-admin/firestore');
  return { ...actual, FieldValue: { serverTimestamp: () => 'now' } };
});

type Doc = Record<string, unknown>;
type Store = Record<string, Record<string, Doc>>;

/** Minimal in-memory Firestore: doc get/set/delete, add, equality where(), recursiveDelete. */
function makeFakeFirestore(initial: Store) {
  const store: Store = {};
  for (const [name, docs] of Object.entries(initial)) store[name] = { ...docs };
  const docsOf = (name: string) => (store[name] ??= {});

  function docRef(name: string, id: string) {
    return {
      id,
      path: `${name}/${id}`,
      get: async () => ({ exists: docsOf(name)[id] !== undefined, id, data: () => docsOf(name)[id], ref: docRef(name, id) }),
      set: async (data: Doc, opts?: { merge?: boolean }) => {
        docsOf(name)[id] = opts?.merge ? { ...docsOf(name)[id], ...data } : data;
      },
    };
  }

  let autoId = 0;
  function collection(name: string) {
    const predicates: Array<(d: Doc) => boolean> = [];
    const query = {
      doc: (id: string) => docRef(name, id),
      add: async (data: Doc) => docRef(name, `auto_${++autoId}`).set(data),
      where(field: string, _op: string, value: unknown) {
        predicates.push((d) => d[field] === value);
        return query;
      },
      get: async () => ({
        docs: Object.entries(docsOf(name))
          .filter(([, d]) => predicates.every((p) => p(d)))
          .map(([id]) => ({ id, ref: docRef(name, id) })),
      }),
    };
    return query;
  }

  const db = {
    collection,
    recursiveDelete: async (ref: { path: string }) => {
      const [name, id] = ref.path.split('/');
      delete docsOf(name)[id];
    },
  };
  return { db, store };
}

jest.mock('../config/firebase-admin', () => ({ adminFirestore: jest.fn() }));
jest.mock('./razorpay.service', () => ({ cancelSubscription: jest.fn(), fetchSubscription: jest.fn() }));

import { adminFirestore } from '../config/firebase-admin';
import { previewUserDeletion, purgeUserAccount } from './accountDeletion.service';
import { cancelSubscription, fetchSubscription } from './razorpay.service';

const mockAdminFirestore = adminFirestore as unknown as jest.Mock;
const mockCancel = cancelSubscription as unknown as jest.Mock;
const mockFetch = fetchSubscription as unknown as jest.Mock;

const UID = '+919999999999';
const OTHER = '+918888888888';

function seed(): Store {
  return {
    users: {
      [UID]: { phoneNumber: UID, userProfileId: 'prof_1', subscriptionId: 'sub_live' },
      [OTHER]: { phoneNumber: OTHER },
    },
    userProfiles: { prof_1: { uid: UID }, prof_other: { uid: OTHER } },
    reports: { [UID]: { status: 'ready' } },
    personaChats: { c1: { userId: UID }, c2: { userId: UID }, c3: { userId: OTHER } },
    chats: { old1: { userId: UID } },
    subscriptions: { sub_live: { userId: UID, status: 'active' }, sub_old: { userId: UID, status: 'cancelled' } },
    transactions: { pay_1: { userId: UID }, pay_x: { userId: OTHER } },
    payments: { pay_1: { userId: UID }, [`trial_credits_${UID}`]: { userId: UID, purpose: 'trial' } },
    paymentOrders: { order_1: { userId: UID } },
    adminScheduledActions: { a1: { userId: UID, status: 'scheduled' } },
  };
}

function setup(initial: Store) {
  const fake = makeFakeFirestore(initial);
  mockAdminFirestore.mockReturnValue(fake.db);
  return fake.store;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('previewUserDeletion', () => {
  it('counts every document that belongs to the user, and nobody else', async () => {
    setup(seed());

    expect(await previewUserDeletion(UID)).toEqual({
      chats: 3,
      subscriptions: 2,
      transactions: 1,
      payments: 2,
      paymentOrders: 1,
      scheduledActions: 1,
      profileDocs: 3,
    });
  });
});

describe('purgeUserAccount', () => {
  it('cancels the live auto-debit, then removes all of the user\'s data and only theirs', async () => {
    const store = setup(seed());
    mockCancel.mockResolvedValue({ status: 'cancelled' });

    const result = await purgeUserAccount(UID, 'Asha');

    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockCancel).toHaveBeenCalledWith('sub_live', false);
    expect(result.subscriptionsCancelled).toBe(1);

    for (const name of ['chats', 'subscriptions', 'paymentOrders', 'adminScheduledActions', 'reports']) {
      expect(Object.values(store[name]).filter((d) => d.userId === UID)).toEqual([]);
    }
    expect(Object.keys(store.users)).toEqual([OTHER]);
    expect(Object.keys(store.userProfiles)).toEqual(['prof_other']);
    expect(Object.keys(store.personaChats)).toEqual(['c3']);
    expect(Object.keys(store.transactions)).toEqual(['pay_x']);
    expect(store.payments).toEqual({});

    expect(Object.values(store.adminLogs)).toEqual([
      expect.objectContaining({ action: 'delete_account', adminName: 'Asha', userId: UID, outcome: 'success' }),
    ]);
    expect(Object.values(store.accountDeletions)).toEqual([
      expect.objectContaining({ reason: 'admin_deleted', deletedBy: 'Asha', subscriptionCancelled: true }),
    ]);
  });

  it('deletes nothing when Razorpay will not confirm the auto-debit is stopped', async () => {
    const store = setup(seed());
    mockCancel.mockRejectedValue(new Error('gateway down'));
    mockFetch.mockResolvedValue({ status: 'active' });

    await expect(purgeUserAccount(UID, 'Asha')).rejects.toThrow('nothing was deleted');

    expect(store.users[UID]).toBeDefined();
    expect(Object.keys(store.transactions)).toContain('pay_1');
    expect(Object.values(store.adminLogs)).toEqual([expect.objectContaining({ outcome: 'failed' })]);
  });

  it('rejects an unknown user', async () => {
    setup(seed());
    await expect(purgeUserAccount('+917777777777', 'Asha')).rejects.toThrow('No user found');
  });
});
