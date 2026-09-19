import type { Request, Response } from 'express';
import type { Timestamp } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';
import {
  generateAndStoreReport,
  isKundaliUnlocked,
  markReportPending,
} from '../services/report.service';
import { HttpError, UnauthorizedError } from '../utils/errors';
import type { ReportRecord, UserProfileRecord } from '../types';

function serializeTimestamp(value: Timestamp | undefined): string | undefined {
  return value?.toDate().toISOString();
}

export async function getMyReport(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  // Enforced here, not just in the app: a locked user gets no chart data.
  if (!(await isKundaliUnlocked(req.uid))) {
    res.json({ status: 'locked' });
    return;
  }

  const snapshot = await adminFirestore().collection('reports').doc(req.uid).get();
  if (!snapshot.exists) {
    res.json(null);
    return;
  }

  const data = snapshot.data() as ReportRecord;
  res.json({
    status: data.status,
    content: data.content,
    kundali: data.kundali ?? null,
    generatedAt: serializeTimestamp(data.generatedAt),
  });
}

/**
 * The user's auto-debit mandate state — what the paywall/upgrade screens use
 * to decide between "start Rs.1 trial", "upgrade now", and "you're set".
 * Never exposes the Razorpay customer/token ids to the client.
 */
export async function getMyMandate(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const snapshot = await adminFirestore().collection('users').doc(req.uid).get();
  if (!snapshot.exists) {
    res.json(null);
    return;
  }

  const data = snapshot.data() as UserProfileRecord;
  res.json({
    mandateStatus: data.mandateStatus ?? 'none',
    mandateMethod: data.mandateMethod ?? null,
    trialCreditsClaimed: data.trialCreditsClaimed ?? false,
    nextAutoDebitAt: serializeTimestamp(data.nextAutoDebitAt),
    nextAutoDebitAmount: data.nextAutoDebitAmount ?? null,
    graceUntil: serializeTimestamp(data.graceUntil),
    lastPaymentFailureReason: data.lastPaymentFailureReason ?? null,
  });
}

export async function generateReport(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();
  if (!(await isKundaliUnlocked(req.uid))) {
    throw new HttpError(402, 'Unlock your kundali to generate it.');
  }
  await markReportPending(req.uid);
  generateAndStoreReport(req.uid).catch(console.error);
  res.json({ status: 'pending' });
}
