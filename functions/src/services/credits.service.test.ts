import { InsufficientCreditsError, NotFoundError } from '../utils/errors';

type FakeDoc = { exists: boolean; data: () => Record<string, unknown> };
type Collection = 'users' | 'subscriptions' | 'personaChats' | 'payments';

function makeFakeFirestore(
  users: Record<string, Record<string, unknown>>,
  subscriptions: Record<string, Record<string, unknown>>,
  personaChats: Record<string, Record<string, unknown>> = {},
  payments: Record<string, Record<string, unknown>> = {},
) {
  const updates: { id: string; data: Record<string, unknown> }[] = [];
  const sets: { id: string; data: Record<string, unknown> }[] = [];
  const sources: Record<Collection, Record<string, Record<string, unknown>>> = {
    users,
    subscriptions,
    personaChats,
    payments,
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

describe('creditWallet', () => {
  it('throws NotFoundError when the user profile does not exist', async () => {
    const { db } = makeFakeFirestore({}, {});
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const { creditWallet } = await import('./credits.service');

    await expect(creditWallet('uid1', 100, 'pay_1', 1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('credits the wallet at the configured rate and records a payment ledger entry', async () => {
    const { db, updates, sets } = makeFakeFirestore({ uid1: { credits: 5 } }, {});
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const { creditWallet } = await import('./credits.service');

    // Rs 100 at 1 credit per rupee = 100 credits.
    const result = await creditWallet('uid1', 100, 'pay_1', 1);

    expect(result).toEqual({ creditsAwarded: 100, newBalance: 105, alreadyProcessed: false });
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe('uid1');
    expect(sets).toHaveLength(1);
    expect(sets[0].id).toBe('pay_1');
    expect(sets[0].data.purpose).toBe('topup');
  });

  it('is a no-op when the same razorpayPaymentId was already processed (idempotent against retries/webhook redelivery)', async () => {
    const { db, updates, sets } = makeFakeFirestore(
      { uid1: { credits: 105 } },
      {},
      {},
      { pay_1: { userId: 'uid1', purpose: 'topup', creditsAwarded: 100, status: 'paid' } },
    );
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const { creditWallet } = await import('./credits.service');

    const result = await creditWallet('uid1', 100, 'pay_1', 1);

    expect(result).toEqual({ creditsAwarded: 0, newBalance: 105, alreadyProcessed: true });
    expect(updates).toHaveLength(0);
    expect(sets).toHaveLength(0);
  });
});
