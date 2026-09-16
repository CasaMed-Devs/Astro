import jwt from 'jsonwebtoken';

import { env } from '../config/env';
import { HttpError } from '../utils/errors';

export interface AdminSessionTokenPayload {
  role: 'admin';
}

const ADMIN_SESSION_TTL = '12h';

class AdminAuthNotConfiguredError extends HttpError {
  constructor() {
    super(503, 'Admin sign-in is not configured.');
  }
}

function requireSecret(): string {
  if (!env.auth.jwtSecret) {
    throw new AdminAuthNotConfiguredError();
  }
  return env.auth.jwtSecret;
}

/**
 * Deliberately reuses the same JWT secret as the user session token
 * (env.auth.jwtSecret) rather than introducing a second one — the payload
 * shape (`role: 'admin'`) is structurally distinct from a user token's
 * (`uid`, `phoneNumber`), so one can never be mistaken for the other.
 */
export function createAdminSessionToken(): string {
  const payload: AdminSessionTokenPayload = { role: 'admin' };
  return jwt.sign(payload, requireSecret(), { expiresIn: ADMIN_SESSION_TTL });
}

export function verifyAdminSessionToken(token: string): AdminSessionTokenPayload {
  const decoded = jwt.verify(token, requireSecret());
  if (typeof decoded !== 'object' || decoded.role !== 'admin') {
    throw new Error('Malformed admin session token payload.');
  }
  return { role: 'admin' };
}
