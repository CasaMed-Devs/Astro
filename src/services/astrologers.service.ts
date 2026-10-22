import { apiClient } from '@/services/apiClient';
import type { AstrologerProfile } from '@/features/astrologers/types';
import { toAppError } from '@/utils/errors';

// The astrologer list rarely changes, and the list → detail → chat flow asks
// for it on every screen. Reuse one fetch (and share an in-flight one) for a
// few minutes so opening a chat doesn't wait on the whole list again.
const PROFILES_TTL_MS = 5 * 60 * 1000;
let cachedProfiles: { profiles: AstrologerProfile[]; fetchedAt: number } | null = null;
let inFlight: Promise<AstrologerProfile[]> | null = null;

export async function fetchAstrologerProfiles(): Promise<AstrologerProfile[]> {
  if (cachedProfiles && Date.now() - cachedProfiles.fetchedAt < PROFILES_TTL_MS) {
    return cachedProfiles.profiles;
  }
  if (inFlight) return inFlight;

  inFlight = apiClient
    .get<{ profiles: AstrologerProfile[] }>('/astrologers')
    .then(({ profiles }) => {
      cachedProfiles = { profiles, fetchedAt: Date.now() };
      return profiles;
    })
    .catch((error) => {
      throw toAppError(error);
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
