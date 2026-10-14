import type { Request, Response } from 'express';
import { z } from 'zod';

import { previewUserDeletion, purgeUserAccount } from '../../services/accountDeletion.service';
import { parseAdminInput, phoneNumberSchema } from '../../utils/adminInput';
import { ValidationError } from '../../utils/errors';
import { uidForPhoneNumber } from '../../utils/uid';

const previewQuerySchema = z.object({ phoneNumber: phoneNumberSchema });

/**
 * The number is sent twice — once as looked up, once as the admin retyped
 * it — so a stale form or a stray API call can never delete the wrong user.
 */
const deleteSchema = z.object({
  phoneNumber: phoneNumberSchema,
  confirmPhoneNumber: phoneNumberSchema,
});

export async function previewDeletion(req: Request, res: Response): Promise<void> {
  const { phoneNumber } = parseAdminInput(previewQuerySchema, req.query);
  res.json(await previewUserDeletion(uidForPhoneNumber(phoneNumber)));
}

export async function deleteUserAccount(req: Request, res: Response): Promise<void> {
  const { phoneNumber, confirmPhoneNumber } = parseAdminInput(deleteSchema, req.body);
  if (phoneNumber !== confirmPhoneNumber) {
    throw new ValidationError('The retyped number does not match. Nothing was deleted.');
  }

  res.json(await purgeUserAccount(uidForPhoneNumber(phoneNumber), req.adminName ?? 'unknown'));
}
