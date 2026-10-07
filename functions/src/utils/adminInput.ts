import { z } from 'zod';

import { ValidationError } from './errors';

const IST_OFFSET = '+05:30';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * A user number as an admin types it: a bare 10-digit Indian mobile number
 * (gets +91), or a full E.164 number. Spaces and dashes are ignored.
 */
export const phoneNumberSchema = z
  .string({ required_error: 'User number is required.' })
  .transform((value) => value.replace(/[\s-]/g, ''))
  .transform((value) => (/^\d{10}$/.test(value) ? `+91${value}` : value))
  .refine((value) => /^\+\d{10,15}$/.test(value), {
    message: 'Enter a valid user number — 10 digits, or with country code like +919876543210.',
  });

/** A calendar date from the dashboard's date picker: YYYY-MM-DD, and a real day. */
export const dateSchema = z
  .string({ required_error: 'Date is required.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format.')
  .refine((value) => !Number.isNaN(startOfIstDay(value).getTime()) && toIstDate(startOfIstDay(value)) === value, {
    message: 'That date does not exist.',
  });

/**
 * Parses admin form input, surfacing the first problem as a plain sentence —
 * the shared error handler's generic "Invalid request." isn't something a
 * support agent can act on.
 */
export function parseAdminInput<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown): z.infer<Schema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message ?? 'Invalid request.');
  }
  return result.data;
}

// Admin dates are calendar days in India (IST), wherever the server runs.

export function startOfIstDay(date: string): Date {
  return new Date(`${date}T00:00:00.000${IST_OFFSET}`);
}

export function endOfIstDay(date: string): Date {
  return new Date(`${date}T23:59:59.999${IST_OFFSET}`);
}

/** The IST calendar date (YYYY-MM-DD) that an instant falls on. */
export function toIstDate(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function todayInIst(): string {
  return toIstDate(new Date());
}
