import type { Request, Response } from 'express';
import type { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

import { adminFirestore } from '../../config/firebase-admin';
import { NotFoundError } from '../../utils/errors';
import { uidForPhoneNumber } from '../../utils/uid';
import type { ReportRecord, SubscriptionRecord, UserProfileRecord } from '../../types';

function serializeTimestamp(value: Timestamp | undefined): string | undefined {
  return value?.toDate().toISOString();
}

async function fetchUserDetail(uid: string) {
  const db = adminFirestore();
  const [userSnap, subscriptionSnap, reportSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('subscriptions').doc(uid).get(),
    db.collection('reports').doc(uid).get(),
  ]);

  if (!userSnap.exists) throw new NotFoundError('No user found for that phone number.');

  const user = userSnap.data() as UserProfileRecord & {
    createdAt?: Timestamp;
    updatedAt?: Timestamp;
  };
  const subscription = subscriptionSnap.data() as
    (SubscriptionRecord & { updatedAt?: Timestamp }) | undefined;
  const report = reportSnap.data() as (ReportRecord & { generatedAt?: Timestamp }) | undefined;

  return {
    uid,
    phoneNumber: user.phoneNumber,
    name: user.name,
    dateOfBirth: user.dateOfBirth,
    timeOfBirth: user.timeOfBirth,
    placeOfBirth: user.placeOfBirth,
    gender: user.gender,
    credits: user.credits ?? 0,
    createdAt: serializeTimestamp(user.createdAt),
    updatedAt: serializeTimestamp(user.updatedAt),
    subscription: subscription
      ? {
          planId: subscription.planId,
          status: subscription.status,
          currentPeriodStart: serializeTimestamp(subscription.currentPeriodStart),
          currentPeriodEnd: serializeTimestamp(subscription.currentPeriodEnd),
        }
      : null,
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
