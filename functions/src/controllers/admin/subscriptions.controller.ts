import type { Request, Response } from 'express';
import { z } from 'zod';

import {
  expireSubscription,
  giveSubscription,
  resetSubscription,
  scheduleAction,
  type ScheduledActionType,
} from '../../services/adminSubscription.service';
import {
  dateSchema,
  endOfIstDay,
  parseAdminInput,
  phoneNumberSchema,
  startOfIstDay,
  todayInIst,
} from '../../utils/adminInput';
import { ValidationError } from '../../utils/errors';
import { uidForPhoneNumber } from '../../utils/uid';

const MAX_CREDITS_PER_GRANT = 100_000;

const giveSchema = z.object({
  phoneNumber: phoneNumberSchema,
  validUntil: dateSchema,
  credits: z
    .number({ required_error: 'Credits are required.', invalid_type_error: 'Credits must be a number.' })
    .int('Credits must be a whole number.')
    .min(0, 'Credits cannot be negative.')
    .max(MAX_CREDITS_PER_GRANT, `Credits cannot be more than ${MAX_CREDITS_PER_GRANT} at a time.`),
  unlockKundali: z.boolean().optional(),
});

const datedActionSchema = z.object({
  phoneNumber: phoneNumberSchema,
  date: dateSchema,
});

function adminNameOf(req: Request): string {
  return req.adminName ?? 'unknown';
}

export async function give(req: Request, res: Response): Promise<void> {
  const { phoneNumber, validUntil, credits, unlockKundali } = parseAdminInput(giveSchema, req.body);
  if (validUntil < todayInIst()) {
    throw new ValidationError('The valid-until date cannot be in the past.');
  }

  const result = await giveSubscription(
    uidForPhoneNumber(phoneNumber),
    endOfIstDay(validUntil),
    credits,
    adminNameOf(req),
    unlockKundali,
  );
  res.json(result);
}

/**
 * Reset and Expire share their date rule: today runs the action right away,
 * a future date queues it for the start of that day (IST), and a past date
 * is refused — there is no meaningful way to end a subscription in the past.
 */
async function runOrSchedule<Result>(
  req: Request,
  type: ScheduledActionType,
  runNow: (uid: string, adminName: string) => Promise<Result>,
): Promise<{ scheduled: false; result: Result } | { scheduled: true; scheduledFor: string }> {
  const { phoneNumber, date } = parseAdminInput(datedActionSchema, req.body);
  const uid = uidForPhoneNumber(phoneNumber);
  const today = todayInIst();

  if (date < today) throw new ValidationError('The date cannot be in the past.');
  if (date === today) return { scheduled: false, result: await runNow(uid, adminNameOf(req)) };

  const { scheduledFor } = await scheduleAction(type, uid, startOfIstDay(date), adminNameOf(req));
  return { scheduled: true, scheduledFor };
}

export async function reset(req: Request, res: Response): Promise<void> {
  res.json(await runOrSchedule(req, 'reset', resetSubscription));
}

export async function expire(req: Request, res: Response): Promise<void> {
  res.json(await runOrSchedule(req, 'expire', expireSubscription));
}
