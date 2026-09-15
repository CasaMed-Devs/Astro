import { apiClient } from '@/services/apiClient';
import type { ReportDoc } from '@/types/firestore';
import { pollFor } from '@/utils/poll';

const POLL_INTERVAL_MS = 4000;

export function subscribeToReport(callback: (report: ReportDoc | null) => void): () => void {
  return pollFor(() => apiClient.get<ReportDoc | null>('/reports/me'), callback, POLL_INTERVAL_MS);
}
