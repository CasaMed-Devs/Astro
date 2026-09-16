import { apiClient } from '@/services/apiClient';
import { clearSession, getSession, loadSession, setSession, subscribeToSession } from '@/services/session';
import type { Session } from '@/services/session';
import { toAppError } from '@/utils/errors';

export type { Session };

export interface SendOtpResult {
  identificationToken: string;
  /** The OTP the backend just sent, echoed back so it can be shown on the OTP screen. */
  otp: string;
}

/** Asks the backend to send a 6-digit OTP via the pixy auth service. `phoneNumber` must be E.164. */
export async function sendOtp(phoneNumber: string): Promise<SendOtpResult> {
  try {
    const { identificationToken, otp } = await apiClient.post<{
      sent: true;
      identificationToken: string;
      otp: string;
    }>('/auth/send-otp', { phoneNumber });
    return { identificationToken, otp };
  } catch (error) {
    throw toAppError(error);
  }
}

/** Verifies the OTP against the backend and, on success, starts a session. */
export async function confirmOtp(
  phoneNumber: string,
  code: string,
  identificationToken: string,
): Promise<Session> {
  try {
    const { token, uid } = await apiClient.post<{ token: string; uid: string }>('/auth/verify-otp', {
      phoneNumber,
      code,
      identificationToken,
    });
    const session: Session = { token, uid, phoneNumber };
    await setSession(session);
    return session;
  } catch (error) {
    throw toAppError(error);
  }
}

/**
 * Dev-only phone/OTP skip for manual testing. Only succeeds against a
 * backend that has ENABLE_DEV_LOGIN=true set (off by default everywhere);
 * only call this from a __DEV__-gated UI.
 */
export async function devLogin(): Promise<Session> {
  try {
    const { token, uid, phoneNumber } = await apiClient.post<{
      token: string;
      uid: string;
      phoneNumber: string;
    }>('/auth/dev-login');
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
