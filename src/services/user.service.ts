import { apiClient } from '@/services/apiClient';
import type { Gender, UserProfile } from '@/types/firestore';
import { toAppError } from '@/utils/errors';

export interface BirthDetailsInput {
  name?: string;
  dateOfBirth: string;
  timeOfBirth: string;
  placeOfBirth: string;
  latitude: number;
  longitude: number;
  timezoneOffset: number;
  gender: Gender;
}

export async function getMyProfile(): Promise<UserProfile> {
  try {
    return await apiClient.get<UserProfile>('/me');
  } catch (error) {
    throw toAppError(error);
  }
}

export async function saveBirthDetails(details: BirthDetailsInput): Promise<UserProfile> {
  try {
    return await apiClient.post<UserProfile>('/me/birth-details', details);
  } catch (error) {
    throw toAppError(error);
  }
}

export async function updateDisplayName(name: string): Promise<UserProfile> {
  try {
    return await apiClient.post<UserProfile>('/me/display-name', { name });
  } catch (error) {
    throw toAppError(error);
  }
}
