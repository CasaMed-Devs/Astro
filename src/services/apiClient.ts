import Constants from 'expo-constants';

import { getSession } from '@/services/session';
import { AppError } from '@/utils/errors';

type BackendTarget = 'local' | 'vercel' | 'firebase';

const BACKEND_URLS: Record<BackendTarget, string | undefined> = {
  local: process.env.EXPO_PUBLIC_API_URL_LOCAL,
  vercel: process.env.EXPO_PUBLIC_API_URL_VERCEL,
  firebase: process.env.EXPO_PUBLIC_API_URL_FIREBASE,
};

const BACKEND_TARGET = (process.env.EXPO_PUBLIC_BACKEND_TARGET as BackendTarget | undefined) ?? 'firebase';

const API_URL = BACKEND_URLS[BACKEND_TARGET] ?? Constants.expoConfig?.extra?.apiUrl ?? '';

const REQUEST_TIMEOUT_MS = 15_000;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  timeoutMs?: number;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!API_URL) {
    throw new AppError('api/not-configured', 'The backend API URL is not configured.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);

  try {
    const token = getSession()?.token;
    const response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const isJson = response.headers.get('content-type')?.includes('application/json');
    const payload = isJson ? await response.json() : null;

    if (!response.ok) {
      throw mapErrorResponse(response.status, payload);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AppError('api/timeout', 'The request took too long. Please try again.');
    }
    throw new AppError('network/no-connection', 'Check your internet connection and try again.');
  } finally {
    clearTimeout(timeout);
  }
}

function mapErrorResponse(status: number, payload: unknown): AppError {
  const message =
    payload && typeof payload === 'object' && 'message' in payload
      ? String((payload as { message: unknown }).message)
      : undefined;

  if (status === 401 || status === 403) {
    return new AppError('api/unauthorized', message ?? 'Please sign in again to continue.');
  }
  if (status === 402) {
    return new AppError(
      'credits/insufficient',
      message ?? "You're out of free messages. Upgrade to Astro101 Plus to keep chatting.",
    );
  }
  if (status === 503) {
    return new AppError(
      'api/not-configured',
      message ?? 'This feature is temporarily unavailable.',
    );
  }
  return new AppError('api/unknown', message ?? 'Something went wrong. Please try again.');
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, options?: { timeoutMs?: number }) =>
    request<T>(path, { method: 'POST', body, timeoutMs: options?.timeoutMs }),
};
