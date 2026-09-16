import { apiClient } from '@/services/apiClient';
import type { AstrologerProfile } from '@/features/astrologers/types';
import { toAppError } from '@/utils/errors';

export async function fetchAstrologerProfiles(): Promise<AstrologerProfile[]> {
  try {
    const { profiles } = await apiClient.get<{ profiles: AstrologerProfile[] }>('/astrologers');
    return profiles;
  } catch (error) {
    throw toAppError(error);
  }
}
