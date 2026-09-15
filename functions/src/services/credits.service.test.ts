import { InsufficientCreditsError, NotFoundError } from '../utils/errors';

type FakeDoc = { exists: boolean; data: () => Record<string, unknown> };

function makeFakeFirestore(
  users: Record<string, Record<string, unknown>>,
  subscriptions: Record<string, Record<string, unknown>>,
) {
  const updates: { id: string; data: Record<string, unknown> }[] = [];

  const db = {
    collection: (name: 'users' | 'subscriptions') => ({
      doc: (id: string) => ({
        id,
        __collection: name,
      }),
    }),
    runTransaction: async (fn: (transaction: unknown) => Promise<void>) => {
      const transaction = {
        get: async (ref: { id: string; __collection: string }): Promise<FakeDoc> => {
          const source = ref.__collection === 'users' ? users : subscriptions;
          const data = source[ref.id];
          return { exists: Boolean(data), data: () => data ?? {} };
        },
        update: (ref: { id: string }, data: Record<string, unknown>) => {
          updates.push({ id: ref.id, data });
        },
      };
      await fn(transaction);
    },
  };

  return { db, updates };
}

jest.mock('../config/firebase-admin', () => ({
  adminFirestore: jest.fn(),
}));

describe('assertAndConsumeEntitlement', () => {
  it('throws NotFoundError when the user profile does not exist', async () => {
    const { db } = makeFakeFirestore({}, {});
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const { assertAndConsumeEntitlement } = await import('./credits.service');

    await expect(assertAndConsumeEntitlement('uid1', 2)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws InsufficientCreditsError when the free-tier user has too few credits', async () => {
    const { db } = makeFakeFirestore({ uid1: { credits: 1 } }, {});
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const { assertAndConsumeEntitlement } = await import('./credits.service');

    await expect(assertAndConsumeEntitlement('uid1', 2)).rejects.toBeInstanceOf(
      InsufficientCreditsError,
    );
  });

  it('allows an active subscriber through without touching credits', async () => {
    const { db, updates } = makeFakeFirestore(
      { uid1: { credits: 0 } },
      { uid1: { status: 'active' } },
    );
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const { assertAndConsumeEntitlement } = await import('./credits.service');

    await expect(assertAndConsumeEntitlement('uid1', 2)).resolves.toBeUndefined();
    expect(updates).toHaveLength(0);
  });

  it('decrements credits for a free-tier user with enough balance', async () => {
    const { db, updates } = makeFakeFirestore({ uid1: { credits: 5 } }, {});
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const { assertAndConsumeEntitlement } = await import('./credits.service');

    await assertAndConsumeEntitlement('uid1', 2);

    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe('uid1');
  });
});
