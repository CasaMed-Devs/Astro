import type { Request, Response } from 'express';
import type { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

import { adminFirestore } from '../../config/firebase-admin';
import { getUserProfile } from '../../services/userProfile.service';
import { parseAdminInput, phoneNumberSchema } from '../../utils/adminInput';
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
      // Set while an admin-given subscription is in force.
      adminGrantExpiresAt: serializeTimestamp(user.adminSubscription?.expiresAt) ?? null,
    },
    // Same rule as report.service.ts's isKundaliUnlocked.
    kundaliUnlocked: Boolean(user.kundaliUnlocked || report?.kundali),
    report: report
      ? {
          status: report.status,
          generatedAt: serializeTimestamp(report.generatedAt),
        }
      : null,
  };
}

const lookupQuerySchema = z.object({ phoneNumber: phoneNumberSchema });

export async function lookupUserByPhone(req: Request, res: Response): Promise<void> {
  const { phoneNumber } = parseAdminInput(lookupQuerySchema, req.query);
  const uid = uidForPhoneNumber(phoneNumber);
  res.json(await fetchUserDetail(uid));
}

// transactions/{id}.purpose -> the "Subscription type" support sees. The app
// sells one recurring plan, so every non-trial subscription charge is Monthly.
const DISPUTE_TYPE_LABELS: Record<string, string> = {
  trial: 'Trial',
  subscription: 'Monthly',
  direct_subscription: 'Monthly',
  autodebit: 'Monthly',
  topup: 'Top-up',
  report: 'Kundali report',
  admin_grant: 'Admin grant',
};

/**
 * Everything support needs to investigate a payment complaint for one user:
 * every transactions/{id} row of theirs (paid and failed payments of every
 * kind, plus admin-given credits), newest first.
 */
export async function getDisputeData(req: Request, res: Response): Promise<void> {
  const { phoneNumber } = parseAdminInput(lookupQuerySchema, req.query);
  const uid = uidForPhoneNumber(phoneNumber);
  const db = adminFirestore();

  const [userSnap, transactionsSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    // Sorted below rather than with orderBy, which would need a composite index.
    db.collection('transactions').where('userId', '==', uid).get(),
  ]);
  if (!userSnap.exists) throw new NotFoundError('No user found for that number.');

  const user = userSnap.data() as UserProfileRecord;
  const profile = user.userProfileId ? await getUserProfile(user.userProfileId) : undefined;

  const records = transactionsSnap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: profile?.name ?? null,
        phoneNumber: user.phoneNumber ?? uid,
        subscriptionId: (data.subscriptionId as string | null | undefined) ?? null,
        subscriptionType: DISPUTE_TYPE_LABELS[data.purpose as string] ?? 'Other',
        createdAt: serializeTimestamp(data.createdAt as Timestamp | undefined) ?? null,
        // A failed payment took no money, whatever amount was attempted.
        paymentDeducted: data.status === 'paid' ? ((data.amount as number | undefined) ?? 0) : 0,
        credits: (data.creditsAwarded as number | undefined) ?? 0,
        status: (data.status as string | undefined) ?? 'paid',
        failureReason: (data.failureReason as string | null | undefined) ?? null,
      };
    })
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

  res.json({
    user: {
      name: profile?.name ?? null,
      phoneNumber: user.phoneNumber ?? uid,
      credits: user.credits ?? 0,
      mandateStatus: user.mandateStatus ?? 'none',
    },
    records,
  });
}

export async function getUserByUid(req: Request, res: Response): Promise<void> {
  const { uid } = req.params;
  res.json(await fetchUserDetail(uid));
}
