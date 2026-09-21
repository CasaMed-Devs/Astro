import type { Request, Response } from 'express';

import { reconcilePayments } from '../services/reconcile.service';
import { UnauthorizedError } from '../utils/errors';

/**
 * Called by the app when it returns to the foreground: re-checks the user's
 * recent unresolved orders with Razorpay and applies any captured payment the
 * client verify and the webhook both missed.
 */
export async function reconcilePaymentsHandler(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  res.json(await reconcilePayments(req.uid));
}
