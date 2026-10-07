import type { Request, Response } from 'express';

const store = new Map<string, Record<string, unknown>>();

function docRef(path: string) {
  const ref = {
    get: async () => ({ exists: store.has(path), data: () => store.get(path), ref }),
    set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
      store.set(path, options?.merge ? { ...store.get(path), ...data } : data);
    },
    delete: async () => {
      store.delete(path);
    },
  };
  return ref;
}

function docsIn(collection: string) {
  return [...store.keys()]
    .filter((path) => path.startsWith(`${collection}/`) && path.split('/').length === 2)
    .map((path) => ({ id: path.split('/')[1], data: () => store.get(path), ref: docRef(path) }));
}

const fakeFirestore = {
  collection: (name: string) => ({
    doc: (id: string) => docRef(`${name}/${id}`),
    get: async () => ({ docs: docsIn(name) }),
    add: async (data: Record<string, unknown>) => {
      store.set(`${name}/auto_${store.size}`, data);
    },
    where: (field: string, _op: string, value: unknown) => ({
      get: async () => ({ docs: docsIn(name).filter((doc) => doc.data()?.[field] === value) }),
    }),
  }),
};

jest.mock('../config/firebase-admin', () => ({ adminFirestore: () => fakeFirestore }));

const cancelSubscription = jest.fn();
const fetchSubscription = jest.fn();
jest.mock('../services/razorpay.service', () => ({
  cancelSubscription: (...args: unknown[]) => cancelSubscription(...args),
  fetchSubscription: (...args: unknown[]) => fetchSubscription(...args),
}));

import { deleteAccount } from './account.controller';

const UID = '+919876543210';
const SUBSCRIPTION_ID = 'sub_live123';

function seedUser(subscriptionStatus: string | null) {
  store.set(`users/${UID}`, {
    phoneNumber: UID,
    userProfileId: 'profile1',
    ...(subscriptionStatus ? { subscriptionId: SUBSCRIPTION_ID } : {}),
  });
  store.set('userProfiles/profile1', { uid: UID, name: 'Test User' });
  store.set(`reports/${UID}`, { status: 'ready' });
  store.set(`payments/trial_credits_${UID}`, { userId: UID });
  store.set(`personaChats/${UID}_meera`, { userId: UID, profileId: 'meera' });
  store.set('personaChats/+911111111111_meera', { userId: '+911111111111', profileId: 'meera' });
  store.set('transactions/pay_1', { userId: UID, amount: 1 });
  if (subscriptionStatus) {
    store.set(`subscriptions/${SUBSCRIPTION_ID}`, { userId: UID, status: subscriptionStatus });
  }
}

async function callDelete(body?: unknown) {
  const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
  await deleteAccount({ uid: UID, body } as Request, res as unknown as Response);
  return res;
}

function deletionRecords() {
  return [...store.entries()].filter(([path]) => path.startsWith('accountDeletions/')).map(([, data]) => data);
}

describe('deleteAccount', () => {
  beforeEach(() => store.clear());

  it('cancels a live mandate immediately, then removes the user data and keeps financial records', async () => {
    seedUser('active');
    cancelSubscription.mockResolvedValue({ status: 'cancelled' });

    const res = await callDelete({ reason: 'privacy_concerns' });

    expect(cancelSubscription).toHaveBeenCalledWith(SUBSCRIPTION_ID, false);
    expect(res.status).toHaveBeenCalledWith(204);
    for (const path of [
      `users/${UID}`,
      'userProfiles/profile1',
      `reports/${UID}`,
      `payments/trial_credits_${UID}`,
      `personaChats/${UID}_meera`,
    ]) {
      expect(store.has(path)).toBe(false);
    }
    expect(store.has('personaChats/+911111111111_meera')).toBe(true);
    expect(store.has('transactions/pay_1')).toBe(true);
    expect(store.get(`subscriptions/${SUBSCRIPTION_ID}`)).toMatchObject({
      status: 'cancelled',
      cancelledReason: 'account_deleted',
    });
    expect(deletionRecords()).toEqual([
      expect.objectContaining({ reason: 'privacy_concerns', details: null, subscriptionCancelled: true }),
    ]);
  });

  it('deletes nothing when the mandate cannot be cancelled', async () => {
    seedUser('active');
    cancelSubscription.mockRejectedValue({ statusCode: 500 });
    fetchSubscription.mockResolvedValue({ status: 'active' });

    await expect(callDelete({ reason: 'no_longer_use' })).rejects.toMatchObject({ status: 502 });

    expect(store.has(`users/${UID}`)).toBe(true);
    expect(store.has('userProfiles/profile1')).toBe(true);
    expect(deletionRecords()).toEqual([]);
  });

  it('proceeds when Razorpay refuses the cancel because the mandate already ended', async () => {
    seedUser('active');
    cancelSubscription.mockRejectedValue({ statusCode: 400 });
    fetchSubscription.mockResolvedValue({ status: 'cancelled' });

    const res = await callDelete({ reason: 'no_longer_use' });

    expect(res.status).toHaveBeenCalledWith(204);
    expect(store.has(`users/${UID}`)).toBe(false);
  });

  it('never calls Razorpay for a user without a live mandate', async () => {
    seedUser('cancelled');

    await callDelete({ reason: 'other', details: '  Moving abroad  ' });

    expect(cancelSubscription).not.toHaveBeenCalled();
    expect(deletionRecords()).toEqual([
      expect.objectContaining({ reason: 'other', details: 'Moving abroad', subscriptionCancelled: false }),
    ]);
  });

  it('rejects "other" without an explanation and deletes nothing', async () => {
    seedUser(null);

    await expect(callDelete({ reason: 'other', details: '   ' })).rejects.toBeDefined();
    expect(store.has(`users/${UID}`)).toBe(true);
  });

  it('still works for app versions that send no body', async () => {
    seedUser(null);

    const res = await callDelete(undefined);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(store.has(`users/${UID}`)).toBe(false);
    expect(deletionRecords()).toEqual([expect.objectContaining({ reason: 'unspecified' })]);
  });
});
