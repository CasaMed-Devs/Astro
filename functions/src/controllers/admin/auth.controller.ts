import type { Request, Response } from 'express';
import { z } from 'zod';

import { env } from '../../config/env';
import { ADMIN_SESSION_COOKIE } from '../../middleware/adminAuth.middleware';
import { createAdminSessionToken } from '../../services/adminToken.service';
import { parseAdminInput } from '../../utils/adminInput';
import { HttpError, UnauthorizedError } from '../../utils/errors';

const loginSchema = z.object({
  name: z.string({ required_error: 'Please enter your name.' }).trim().min(2, 'Please enter your name.').max(60),
  password: z.string({ required_error: 'Please enter the password.' }).min(1, 'Please enter the password.'),
});

class AdminNotConfiguredError extends HttpError {
  constructor() {
    super(503, 'The admin dashboard is not configured yet.');
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  if (!env.admin.password) throw new AdminNotConfiguredError();

  const { name, password } = parseAdminInput(loginSchema, req.body);
  if (password !== env.admin.password) throw new UnauthorizedError('Incorrect password.');

  const token = createAdminSessionToken(name);
  // The admin dashboard is a separate origin now, so the cookie needs
  // SameSite=None (+ Secure, which it requires) to be sent on its
  // cross-origin fetch calls at all. Browsers treat http://localhost as a
  // secure context, so this still works for local dev over plain HTTP.
  res.cookie(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    maxAge: 12 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
}

export async function logout(_req: Request, res: Response): Promise<void> {
  res.clearCookie(ADMIN_SESSION_COOKIE, { sameSite: 'none', secure: true });
  res.json({ ok: true });
}

export async function session(req: Request, res: Response): Promise<void> {
  res.json({ ok: true, name: req.adminName });
}
