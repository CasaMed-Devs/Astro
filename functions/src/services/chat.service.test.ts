import { Timestamp } from 'firebase-admin/firestore';

jest.mock('../config/firebase-admin', () => ({ adminFirestore: jest.fn() }));
jest.mock('./personaApi.service', () => ({ listConversationMessages: jest.fn(), sendChatMessage: jest.fn() }));
jest.mock('./credits.service', () => ({ deductMessageCredit: jest.fn(), getRemainingCredits: jest.fn() }));
jest.mock('./userProfile.service', () => ({ getUserProfile: jest.fn() }));

import { adminFirestore } from '../config/firebase-admin';
import { getRecentChat } from './chat.service';

/** Just enough Firestore for personaChats.where('userId', '==', uid).get(). */
function fakeFirestore(personaChats: Record<string, Record<string, unknown>>) {
  return {
    collection: () => ({
      where: (_field: string, _op: string, uid: string) => ({
        get: async () => ({
          docs: Object.entries(personaChats)
            .filter(([, data]) => data.userId === uid)
            .map(([id, data]) => ({ id, data: () => data })),
        }),
      }),
    }),
  };
}

const at = (iso: string) => Timestamp.fromDate(new Date(iso));

describe('getRecentChat', () => {
  it('returns the most recently messaged chat', async () => {
    (adminFirestore as jest.Mock).mockReturnValue(
      fakeFirestore({
        uid1_ravi: { userId: 'uid1', profileId: 'ravi', lastMessage: 'old', lastMessageAt: at('2026-10-20T10:00:00Z') },
        uid1_meera: { userId: 'uid1', profileId: 'meera', lastMessage: 'new', lastMessageAt: at('2026-10-22T10:00:00Z') },
        uid1_arjun: { userId: 'uid1', profileId: 'arjun' }, // opened, never messaged
        uid2_ravi: { userId: 'uid2', profileId: 'ravi', lastMessageAt: at('2026-10-23T10:00:00Z') },
      }),
    );

    await expect(getRecentChat('uid1')).resolves.toEqual({
      chatId: 'uid1_meera',
      personaId: 'meera',
      lastMessage: 'new',
      lastMessageAt: '2026-10-22T10:00:00.000Z',
    });
  });

  it('returns null when no chat has been messaged yet', async () => {
    (adminFirestore as jest.Mock).mockReturnValue(
      fakeFirestore({ uid1_arjun: { userId: 'uid1', profileId: 'arjun' } }),
    );

    await expect(getRecentChat('uid1')).resolves.toBeNull();
  });
});
