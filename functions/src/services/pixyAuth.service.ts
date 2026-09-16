import { HttpError } from '../utils/errors';

const PIXY_BASE_URL = 'https://api.authservice.postkaro.app/api/v1/auth/pixy';

class PixyAuthUnavailableError extends HttpError {
  constructor(reason: string) {
    super(502, `Could not send the OTP. (${reason})`);
  }
}

export class PixyOtpInvalidError extends HttpError {
  constructor(message: string) {
    super(400, message);
  }
}

export interface PixyLoginResult {
  identificationToken: string;
  otp: string;
}

export interface PixyVerifyResult {
  authToken: string;
  name: string | null;
  isOnboarded: boolean;
  hasTrial: boolean;
  subscriptionType: string;
  paymentDue: unknown;
}

/** Strips the +91 country code the app always sends, since pixy expects a bare 10-digit number. */
function toBareMobileNumber(phoneNumber: string): string {
  return phoneNumber.replace(/^\+91/, '');
}

async function callPixy<T>(path: string, body: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${PIXY_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new PixyAuthUnavailableError(error instanceof Error ? error.message : String(error));
  }

  let payload: { success: boolean; message?: string; data?: T };
  try {
    payload = (await response.json()) as { success: boolean; message?: string; data?: T };
  } catch {
    throw new PixyAuthUnavailableError(`HTTP ${response.status}`);
  }

  if (!response.ok || !payload.success) {
    const message = payload.message ?? `HTTP ${response.status}`;
    if (response.status >= 400 && response.status < 500) {
      throw new PixyOtpInvalidError(message);
    }
    throw new PixyAuthUnavailableError(message);
  }

  if (!payload.data) {
    throw new PixyAuthUnavailableError('Empty response');
  }

  return payload.data;
}

export async function pixyLogin(phoneNumber: string): Promise<PixyLoginResult> {
  const data = await callPixy<{ identification_token: string; otp: string }>('/login', {
    mobile_number: toBareMobileNumber(phoneNumber),
  });

  return { identificationToken: data.identification_token, otp: data.otp };
}

export async function pixyVerifyOtp(
  phoneNumber: string,
  identificationToken: string,
  otp: string,
): Promise<PixyVerifyResult> {
  const data = await callPixy<{
    auth_token: string;
    name: string | null;
    is_onboarded: boolean;
    has_trial: boolean;
    subscription_type: string;
    payment_due: unknown;
  }>('/verify-otp', {
    mobile_number: toBareMobileNumber(phoneNumber),
    identification_token: identificationToken,
    otp,
  });

  return {
    authToken: data.auth_token,
    name: data.name,
    isOnboarded: data.is_onboarded,
    hasTrial: data.has_trial,
    subscriptionType: data.subscription_type,
    paymentDue: data.payment_due,
  };
}
