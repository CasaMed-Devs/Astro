import { apiClient } from '@/services/apiClient';

export interface DailyHoroscope {
  sign: string;
  date: string;
  content: string;
}

export function fetchDailyHoroscope(sign: string): Promise<DailyHoroscope> {
  return apiClient.get<DailyHoroscope>(`/horoscopes/${sign}/today`);
}
