import type { NextFunction, Request, Response } from 'express';

import { verifyAdminSessionToken } from '../services/adminToken.service';
import { UnauthorizedError } from '../utils/errors';

export const ADMIN_SESSION_COOKIE = 'admin_session';

/** One cookie, hand-parsed — not worth adding cookie-parser as a dependency for this. */
function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;

  for (const part of header.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = part.slice(0, separatorIndex).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(separatorIndex + 1).trim());
    }
  }
  return undefined;
}

export async function requireAdminAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = readCookie(req, ADMIN_SESSION_COOKIE);
    if (!token) throw new UnauthorizedError();

    verifyAdminSessionToken(token);
    next();
  } catch {
    next(new UnauthorizedError('Please sign in to the admin dashboard again.'));
  }
}
