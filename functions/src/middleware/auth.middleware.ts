import type { NextFunction, Request, Response } from 'express';

import { verifySessionToken } from '../services/token.service';
import { UnauthorizedError } from '../utils/errors';

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedError();
    }

    const token = header.slice('Bearer '.length);
    const { uid } = verifySessionToken(token);
    req.uid = uid;
    next();
  } catch {
    next(new UnauthorizedError());
  }
}
