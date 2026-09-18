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
  status: 'none' | 'pending' | 'active' | 'failed' | 'cancelled';
  method: 'card' | 'upi' | null;
  trialCreditsClaimed: boolean;
  nextAutoDebitAt?: string;
  nextAutoDebitAmount: number | null;
  graceUntil?: string;
  lastPaymentFailureReason: string | null;
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
  login: (password: string) => request<{ ok: true }>('/admin/login', { method: 'POST', body: { password } }),
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
};
