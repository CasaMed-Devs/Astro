import type { Request, Response } from 'express';
import type { Timestamp } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';
import { UnauthorizedError } from '../utils/errors';
import type { ReportRecord, SubscriptionRecord } from '../types';

function serializeTimestamp(value: Timestamp | undefined): string | undefined {
  return value?.toDate().toISOString();
}

export async function getMyReport(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

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

export async function getMySubscription(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const snapshot = await adminFirestore().collection('subscriptions').doc(req.uid).get();
  if (!snapshot.exists) {
    res.json(null);
    return;
  }

  const data = snapshot.data() as SubscriptionRecord;
  res.json({
    planId: data.planId,
    status: data.status,
    razorpayCustomerId: data.razorpayCustomerId,
    razorpaySubscriptionId: data.razorpaySubscriptionId,
    currentPeriodStart: serializeTimestamp(data.currentPeriodStart),
    currentPeriodEnd: serializeTimestamp(data.currentPeriodEnd),
    graceUntil: serializeTimestamp(data.graceUntil),
    lastPaymentFailureReason: data.lastPaymentFailureReason,
  });
}

import { generateAndStoreReport, markReportPending } from '../services/report.service';

export async function generateReport(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();
  await markReportPending(req.uid);
  generateAndStoreReport(req.uid).catch(console.error);
  res.json({ status: 'pending' });
}
