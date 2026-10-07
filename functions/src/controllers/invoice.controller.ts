import type { Request, Response } from 'express';

import { listInvoices } from '../services/invoice.service';
import { UnauthorizedError } from '../utils/errors';

export async function getMyInvoices(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  res.json({ invoices: await listInvoices(req.uid) });
}
