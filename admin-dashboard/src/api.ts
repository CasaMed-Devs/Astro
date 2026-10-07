const API_URL = import.meta.env.VITE_API_URL;

export class ApiError extends Error {}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
}

/** Cross-origin fetch wrapper — cookie-based admin session, JSON in/out. */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 401) {
    throw new ApiError('Not signed in');
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new ApiError((payload && payload.message) || `Request failed (${response.status})`);
  }

  return payload as T;
}

export interface Astrologer {
  id: string;
  name: string;
  tagline?: string;
  city?: string;
  photoUrl: string;
  sortOrder: number;
}

/** All amounts are whole Rupees. */
export interface PriceValue {
  amount?: number;
  currency?: string;
}

export interface CreditPricingValue {
  /** "The price of 1 credit" — one global number; cost per message is a fixed 1 credit. */
  rupeesPerCredit?: number;
}

export interface TopUpConfigValue {
  minAmount?: number;
  maxAmount?: number;
  presetAmounts?: number[];
  currency?: string;
}

export interface PricingResponse {
  creditPricing: CreditPricingValue;
  trialAmount: PriceValue;
  subscriptionAmount: PriceValue;
  report: PriceValue;
  topUp: TopUpConfigValue;
}

export interface PricingUpdate {
  creditPricing?: CreditPricingValue;
  trialAmount?: PriceValue;
  subscriptionAmount?: PriceValue;
  report?: PriceValue;
  topUp?: TopUpConfigValue;
}

export interface MandateDetail {
  status: 'none' | 'created' | 'authenticated' | 'active' | 'pending' | 'halted' | 'completed' | 'cancelled' | 'expired';
  method: 'card' | 'upi' | null;
  trialCreditsClaimed: boolean;
  subscriptionId: string | null;
  /** Set while an admin-given subscription is in force. */
  adminGrantExpiresAt: string | null;
}

export interface GiveSubscriptionResult {
  previousCredits: number;
  addedCredits: number;
  newCredits: number;
  /** False when the user already had a paid subscription — then only the credits were added. */
  subscriptionApplied: boolean;
  validUntil: string;
}

/** Reset/Expire run right away for today's date, or are queued for a future one. */
export type DatedActionResponse<Result> =
  | { scheduled: false; result: Result }
  | { scheduled: true; scheduledFor: string };

export interface ResetSubscriptionResult {
  previousStatus: string;
  previousCredits: number;
  autoDebitCancelled: boolean;
}

export interface ExpireSubscriptionResult {
  previousStatus: string;
  autoDebitCancelled: boolean;
}

export interface DisputeRecord {
  id: string;
  name: string | null;
  phoneNumber: string;
  subscriptionId: string | null;
  subscriptionType: string;
  createdAt: string | null;
  /** Whole Rupees actually taken — 0 for a failed payment or an admin grant. */
  paymentDeducted: number;
  credits: number;
  status: string;
  failureReason: string | null;
}

export interface DisputeData {
  user: { name: string | null; phoneNumber: string; credits: number; mandateStatus: string };
  records: DisputeRecord[];
}

export interface AdminLog {
  id: string;
  action: string;
  adminName: string;
  phoneNumber: string;
  outcome: 'success' | 'failed' | 'skipped';
  details: Record<string, unknown>;
  error: string | null;
  createdAt?: string;
}

export interface UserDetail {
  uid: string;
  phoneNumber: string;
  name?: string;
  gender?: string;
  dateOfBirth?: string;
  timeOfBirth?: string;
  placeOfBirth?: string;
  credits: number;
  createdAt?: string;
  updatedAt?: string;
  mandate: MandateDetail;
  report: { status: string; generatedAt?: string } | null;
}

export const api = {
  login: (name: string, password: string) =>
    request<{ ok: true }>('/admin/login', { method: 'POST', body: { name, password } }),
  logout: () => request<{ ok: true }>('/admin/logout', { method: 'POST' }),
  session: () => request<{ ok: true }>('/admin/session'),

  listAstrologers: () => request<{ astrologers: Astrologer[] }>('/admin/astrologers'),
  updateAstrologerOrder: (order: string[]) =>
    request<{ ok: true }>('/admin/astrologers/order', { method: 'PUT', body: { order } }),

  getPricing: () => request<PricingResponse>('/admin/pricing'),
  updatePricing: (update: PricingUpdate) =>
    request<{ ok: true }>('/admin/pricing', { method: 'PUT', body: update }),

  lookupUser: (phoneNumber: string) =>
    request<UserDetail>(`/admin/users/lookup?phoneNumber=${encodeURIComponent(phoneNumber)}`),
  getDisputeData: (phoneNumber: string) =>
    request<DisputeData>(`/admin/users/dispute?phoneNumber=${encodeURIComponent(phoneNumber)}`),

  /** Dates are YYYY-MM-DD, read as calendar days in India (IST). */
  giveSubscription: (phoneNumber: string, validUntil: string, credits: number) =>
    request<GiveSubscriptionResult>('/admin/subscriptions/give', {
      method: 'POST',
      body: { phoneNumber, validUntil, credits },
    }),
  resetSubscription: (phoneNumber: string, date: string) =>
    request<DatedActionResponse<ResetSubscriptionResult>>('/admin/subscriptions/reset', {
      method: 'POST',
      body: { phoneNumber, date },
    }),
  expireSubscription: (phoneNumber: string, date: string) =>
    request<DatedActionResponse<ExpireSubscriptionResult>>('/admin/subscriptions/expire', {
      method: 'POST',
      body: { phoneNumber, date },
    }),

  listLogs: () => request<{ logs: AdminLog[] }>('/admin/logs'),
};
