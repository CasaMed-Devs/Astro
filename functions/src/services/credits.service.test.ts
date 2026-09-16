import { InsufficientCreditsError, NotFoundError } from '../utils/errors';

type FakeDoc = { exists: boolean; data: () => Record<string, unknown> };
type Collection = 'users' | 'subscriptions' | 'personaChats';

function makeFakeFirestore(
  users: Record<string, Record<string, unknown>>,
  subscriptions: Record<string, Record<string, unknown>>,
  personaChats: Record<string, Record<string, unknown>> = {},
) {
  const updates: { id: string; data: Record<string, unknown> }[] = [];
  const sets: { id: string; data: Record<string, unknown> }[] = [];
  const sources: Record<Collection, Record<string, Record<string, unknown>>> = {
    users,
    subscriptions,
    personaChats,
  };

  const db = {
    collection: (name: Collection) => ({
      doc: (id: string) => ({
        id,
        __collection: name,
      }),
    }),
    runTransaction: async (fn: (transaction: unknown) => Promise<unknown>) => {
      const transaction = {
        get: async (ref: { id: string; __collection: Collection }): Promise<FakeDoc> => {
          const data = sources[ref.__collection][ref.id];
          return { exists: Boolean(data), data: () => data ?? {} };
        },
        update: (ref: { id: string }, data: Record<string, unknown>) => {
          updates.push({ id: ref.id, data });
        },
        set: (ref: { id: string }, data: Record<string, unknown>) => {
          sets.push({ id: ref.id, data });
        },
      };
      return fn(transaction);
    },
  };

  return { db, updates, sets };
}

jest.mock('../config/firebase-admin', () => ({
  adminFirestore: jest.fn(),
}));

describe('assertActiveOrStartSession', () => {
  it('throws NotFoundError when the user profile does not exist', async () => {
    const { db } = makeFakeFirestore({}, {});
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const { assertActiveOrStartSession } = await import('./credits.service');

    await expect(assertActiveOrStartSession('uid1', 'chat1', 2)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('throws InsufficientCreditsError when a free-tier user with no active session has too few credits', async () => {
    const { db } = makeFakeFirestore({ uid1: { credits: 1 } }, {});
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const { assertActiveOrStartSession } = await import('./credits.service');

    await expect(assertActiveOrStartSession('uid1', 'chat1', 2)).rejects.toBeInstanceOf(
      InsufficientCreditsError,
    );
  });

  it('allows an active subscriber through without touching credits or starting a session', async () => {
    const { db, updates, sets } = makeFakeFirestore(
      { uid1: { credits: 0 } },
      { uid1: { status: 'active' } },
    );
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const { assertActiveOrStartSession } = await import('./credits.service');

    const result = await assertActiveOrStartSession('uid1', 'chat1', 2);

    expect(result).toEqual({ sessionExpiresAt: null, isNewSession: false, remainingCredits: null });
    expect(updates).toHaveLength(0);
    expect(sets).toHaveLength(0);
  });

  it('starts a new session and decrements credits when no session is active', async () => {
    const { db, updates, sets } = makeFakeFirestore({ uid1: { credits: 5 } }, {}, {});
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const { assertActiveOrStartSession } = await import('./credits.service');

    const result = await assertActiveOrStartSession('uid1', 'chat1', 2);

    expect(result.isNewSession).toBe(true);
    expect(result.remainingCredits).toBe(3);
    expect(result.sessionExpiresAt).not.toBeNull();
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe('uid1');
    expect(sets).toHaveLength(1);
    expect(sets[0].id).toBe('chat1');
  });

  it('does not re-charge when a session is already active', async () => {
    const futureExpiry = {
      toMillis: () => Date.now() + 60_000,
      toDate: () => new Date(Date.now() + 60_000),
    };
    const { db, updates, sets } = makeFakeFirestore(
      { uid1: { credits: 5 } },
      {},
      { chat1: { sessionExpiresAt: futureExpiry } },
    );
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const { assertActiveOrStartSession } = await import('./credits.service');

    const result = await assertActiveOrStartSession('uid1', 'chat1', 2);

    expect(result.isNewSession).toBe(false);
    expect(result.remainingCredits).toBe(5);
    expect(updates).toHaveLength(0);
    expect(sets).toHaveLength(0);
  });
});
