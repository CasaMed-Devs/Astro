import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import { adminFirestore } from '../config/firebase-admin';
import { cancelLiveSubscription, deleteUserChats } from '../services/accountDeletion.service';
import { UnauthorizedError } from '../utils/errors';
import type { UserProfileRecord } from '../types';

// Mirrors DELETE_REASONS in the app's app/account/delete.tsx.
const DELETION_REASONS = [
  'no_longer_use',
  'unmet_expectations',
  'payment_issue',
  'privacy_concerns',
  'too_many_notifications',
  'technical_issues',
  'created_by_mistake',
  'switching_app',
  'other',
] as const;

// Every field is optional: app versions released before the reason picker
// existed call this endpoint with no body at all.
const deleteAccountSchema = z
  .object({
    reason: z.enum(DELETION_REASONS).optional(),
    details: z.string().trim().max(500).optional(),
  })
  .refine((body) => body.reason !== 'other' || Boolean(body.details), {
    message: 'Please tell us your reason.',
    path: ['details'],
  });

export async function deleteAccount(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();
  const { uid } = req;
  const { reason, details } = deleteAccountSchema.parse(req.body ?? {});

  const db = adminFirestore();

  const userSnapshot = await db.collection('users').doc(uid).get();
  const user = userSnapshot.data() as UserProfileRecord | undefined;

  const subscriptionCancelled = await cancelLiveSubscription(uid, user?.subscriptionId);

  await deleteUserChats(uid);

  // Mandate state lives on the user doc itself, so deleting it also drops
  // the saved Razorpay token reference — no separate subscription doc.
  //
  // payments/trial_credits_{uid} is deliberately included here even though
  // this function otherwise leaves financial/audit records alone
  // (transactions, subscriptions, payments/{paymentId}) — it isn't a real
  // payment record, it's purely an internal idempotency guard keyed by phone
  // number (see credits.service.ts... mandate.service.ts's
  // grantTrialCreditsOnce). Leaving it meant a user who deleted their
  // account and signed up again with the same number would pay for the
  // Rs.1 trial a second time and receive zero credits — the code would see
  // the stale ledger from the deleted account and assume the one-time gift
  // was already given. Confirmed live in production before this fix.
  await Promise.all([
    db.collection('users').doc(uid).delete(),
    db.collection('reports').doc(uid).delete(),
    db.collection('payments').doc(`trial_credits_${uid}`).delete(),
    user?.userProfileId
      ? db.collection('userProfiles').doc(user.userProfileId).delete()
      : Promise.resolve(),
  ]);

  // Why people leave, for product review. Carries no phone number or uid, so
  // it can outlive the account it describes. Skipped on a retry of an
  // already-completed deletion so one departure is never counted twice.
  if (userSnapshot.exists) {
    await db.collection('accountDeletions').add({
      reason: reason ?? 'unspecified',
      details: reason === 'other' ? (details ?? null) : null,
      subscriptionCancelled,
      deletedAt: FieldValue.serverTimestamp(),
    });
  }

  res.status(204).send();
}
