import { apiClient } from '@/services/apiClient';
import { clearSession, getSession, loadSession, setSession, subscribeToSession } from '@/services/session';
import type { Session } from '@/services/session';
import { toAppError } from '@/utils/errors';

export type { Session };

/** Asks the backend to send a 6-digit OTP via voicenSMS. `phoneNumber` must be E.164. */
export async function sendOtp(phoneNumber: string): Promise<void> {
  try {
    await apiClient.post<{ sent: true }>('/auth/send-otp', { phoneNumber });
  } catch (error) {
    throw toAppError(error);
  }
}

/** Verifies the OTP against the backend and, on success, starts a session. */
export async function confirmOtp(phoneNumber: string, code: string): Promise<Session> {
  try {
    const { token, uid } = await apiClient.post<{ token: string; uid: string }>('/auth/verify-otp', {
      phoneNumber,
      code,
    });
    const session: Session = { token, uid, phoneNumber };
    await setSession(session);
    return session;
  } catch (error) {
    throw toAppError(error);
  }
}

/** Restores a persisted session at app start. Call once before rendering auth-dependent UI. */
export function restoreSession(): Promise<Session | null> {
  return loadSession();
}

export function subscribeToAuthState(callback: (session: Session | null) => void): () => void {
  return subscribeToSession(callback);
}

export function getCurrentSession(): Session | null {
  return getSession();
}

export async function signOut(): Promise<void> {
  await clearSession();
}

export async function getAuthToken(): Promise<string | null> {
  return getSession()?.token ?? null;
}
