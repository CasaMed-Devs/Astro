import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { HttpError } from '../utils/errors';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ message: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ message: 'Invalid request.', issues: err.issues });
    return;
  }

  // The Razorpay SDK rejects with a plain object ({ statusCode, error: { description } }),
  // not an Error — surface its reason instead of a blank 500.
  const razorpayError = (err as { error?: { description?: unknown } } | null)?.error;
  if (typeof razorpayError?.description === 'string') {
    console.error('Razorpay error:', err);
    res.status(400).json({ message: razorpayError.description });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Something went wrong. Please try again.' });
}
