import type { Request, Response } from 'express';
import type { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

import { adminFirestore } from '../../config/firebase-admin';
import { getUserProfile } from '../../services/userProfile.service';
import { NotFoundError } from '../../utils/errors';
import { uidForPhoneNumber } from '../../utils/uid';
import type { ReportRecord, UserProfileRecord } from '../../types';

function serializeTimestamp(value: Timestamp | undefined): string | undefined {
  return value?.toDate().toISOString();
}

async function fetchUserDetail(uid: string) {
  const db = adminFirestore();
  const [userSnap, reportSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('reports').doc(uid).get(),
  ]);

  if (!userSnap.exists) throw new NotFoundError('No user found for that phone number.');

  const user = userSnap.data() as UserProfileRecord & {
    createdAt?: Timestamp;
    updatedAt?: Timestamp;
  };
  const profile = user.userProfileId ? await getUserProfile(user.userProfileId) : undefined;
  const report = reportSnap.data() as (ReportRecord & { generatedAt?: Timestamp }) | undefined;

  return {
    uid,
    phoneNumber: user.phoneNumber,
    name: profile?.name,
    dateOfBirth: profile?.dateOfBirth,
    timeOfBirth: profile?.timeOfBirth,
    placeOfBirth: profile?.placeOfBirth,
    gender: profile?.gender,
    credits: user.credits ?? 0,
    createdAt: serializeTimestamp(user.createdAt),
    updatedAt: serializeTimestamp(user.updatedAt),
    // Mandate state (Razorpay Subscriptions API). Razorpay customer/token
    // ids are deliberately not exposed, even to admins.
    mandate: {
      status: user.mandateStatus ?? 'none',
      method: user.mandateMethod ?? null,
      trialCreditsClaimed: user.trialCreditsClaimed ?? false,
      subscriptionId: user.subscriptionId ?? null,
    },
    report: report
      ? {
          status: report.status,
          generatedAt: serializeTimestamp(report.generatedAt),
        }
      : null,
  };
}

const lookupQuerySchema = z.object({
  phoneNumber: z
    .string()
    .regex(/^\+\d{10,15}$/, 'phoneNumber must be in E.164 format, e.g. +919876543210'),
});

export async function lookupUserByPhone(req: Request, res: Response): Promise<void> {
  const { phoneNumber } = lookupQuerySchema.parse(req.query);
  const uid = uidForPhoneNumber(phoneNumber);
  res.json(await fetchUserDetail(uid));
}

export async function getUserByUid(req: Request, res: Response): Promise<void> {
  const { uid } = req.params;
  res.json(await fetchUserDetail(uid));
}
