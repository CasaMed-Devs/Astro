import { InsufficientCreditsError, NotFoundError } from '../utils/errors';

type FakeDoc = { exists: boolean; data: () => Record<string, unknown> };
type Collection = 'users' | 'payments';

function makeFakeFirestore(
  users: Record<string, Record<string, unknown>>,
  payments: Record<string, Record<string, unknown>> = {},
) {
  const updates: { id: string; data: Record<string, unknown> }[] = [];
  const sets: { id: string; data: Record<string, unknown> }[] = [];
  const sources: Record<Collection, Record<string, Record<string, unknown>>> = {
    users,
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

describe('deductMessageCredit', () => {
  it('throws NotFoundError when the user profile does not exist', async () => {
    const { db } = makeFakeFirestore({});
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const { deductMessageCredit } = await import('./credits.service');

    await expect(deductMessageCredit('uid1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws InsufficientCreditsError when the user has 0 credits', async () => {
    const { db } = makeFakeFirestore({ uid1: { credits: 0 } });
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const { deductMessageCredit } = await import('./credits.service');

    await expect(deductMessageCredit('uid1')).rejects.toBeInstanceOf(InsufficientCreditsError);
  });

  it('deducts exactly 1 credit per message regardless of astrologer', async () => {
    const { db, updates } = makeFakeFirestore({ uid1: { credits: 5 } });
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const { deductMessageCredit } = await import('./credits.service');

    const result = await deductMessageCredit('uid1');

    expect(result).toEqual({ remainingCredits: 4 });
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe('uid1');
  });

  it('allows deducting the very last credit down to exactly 0', async () => {
    const { db } = makeFakeFirestore({ uid1: { credits: 1 } });
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const { deductMessageCredit } = await import('./credits.service');

    const result = await deductMessageCredit('uid1');

    expect(result).toEqual({ remainingCredits: 0 });
  });
});

describe('creditWallet', () => {
  it('throws NotFoundError when the user profile does not exist', async () => {
    const { db } = makeFakeFirestore({});
    const { adminFirestore } = await import('../config/firebase-admin');
    (adminFirestore as jest.Mock).mockReturnValue(db);
    const { creditWallet } = await import('./credits.service');

    await expect(creditWallet('uid1', 100, 'pay_1', 1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('credits the wallet at the configured rate and records a payment ledger entry', async () => {
    const { db, updates, sets } = makeFakeFirestore({ uid1: { credits: 5 } });
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
