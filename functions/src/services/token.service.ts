import jwt from 'jsonwebtoken';

import { env } from '../config/env';
import { HttpError } from '../utils/errors';

export interface SessionTokenPayload {
  uid: string;
  phoneNumber: string;
}

class AuthNotConfiguredError extends HttpError {
  constructor() {
    super(503, 'Sign-in is temporarily unavailable. Please try again later.');
  }
}

function requireSecret(): string {
  if (!env.auth.jwtSecret) {
    throw new AuthNotConfiguredError();
  }
  return env.auth.jwtSecret;
}

/** Issues this app's own session token in place of a Firebase ID token. */
export function createSessionToken(payload: SessionTokenPayload): string {
  return jwt.sign(payload, requireSecret(), { expiresIn: env.auth.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
}

export function verifySessionToken(token: string): SessionTokenPayload {
  const decoded = jwt.verify(token, requireSecret());
  if (typeof decoded !== 'object' || !decoded.uid || !decoded.phoneNumber) {
    throw new Error('Malformed session token payload.');
  }
  return { uid: String(decoded.uid), phoneNumber: String(decoded.phoneNumber) };
}
