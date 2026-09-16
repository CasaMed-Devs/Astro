import { apiClient } from '@/services/apiClient';

export interface PlaceSuggestion {
  placeId: string;
  description: string;
}

export interface ResolvedPlace {
  latitude: number;
  longitude: number;
  timezoneOffset: number;
  completeName: string;
}

export async function searchPlaces(input: string): Promise<PlaceSuggestion[]> {
  const { predictions } = await apiClient.get<{ predictions: PlaceSuggestion[] }>(
    `/places/autocomplete?input=${encodeURIComponent(input)}`,
  );
  return predictions;
}

export async function resolvePlace(placeId: string, timestampSeconds: number): Promise<ResolvedPlace> {
  return apiClient.get<ResolvedPlace>(
    `/places/resolve?placeId=${encodeURIComponent(placeId)}&timestamp=${timestampSeconds}`,
  );
}
