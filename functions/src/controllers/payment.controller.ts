import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import { adminFirestore } from '../config/firebase-admin';
import { getReportPrice, getServerPlan } from '../config/plans';
import { createOrder, verifyPaymentSignature } from '../services/razorpay.service';
import { generateAndStoreReport, markReportPending } from '../services/report.service';
import { HttpError, UnauthorizedError } from '../utils/errors';

const verifySchema = z.object({
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
  signature: z.string().min(1),
});

class PricingNotConfiguredError extends HttpError {
  constructor() {
    super(503, 'Pricing has not been configured yet. Please check back soon.');
  }
}

export async function createSubscriptionOrder(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const { planId } = z.object({ planId: z.string().min(1) }).parse(req.body);
  const plan = getServerPlan(planId);
  if (!plan?.amount || !plan.currency) throw new PricingNotConfiguredError();

  const order = await createOrder(plan.amount, plan.currency, `sub_${req.uid}_${Date.now()}`, {
    uid: req.uid,
    purpose: 'subscription',
    planId,
  });

  await adminFirestore()
    .collection('subscriptions')
    .doc(req.uid)
    .set({ planId, status: 'pending', updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  res.json(order);
}

export async function verifySubscriptionPayment(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const input = verifySchema.parse(req.body);
  verifyPaymentSignature(input);

  const db = adminFirestore();
  const now = FieldValue.serverTimestamp();

  await db.collection('subscriptions').doc(req.uid).set(
    {
      status: 'active',
      razorpaySubscriptionId: input.orderId,
      currentPeriodStart: now,
      updatedAt: now,
    },
    { merge: true },
  );

  await db.collection('payments').add({
    userId: req.uid,
    orderId: input.orderId,
    razorpayPaymentId: input.paymentId,
    purpose: 'subscription',
    status: 'paid',
    createdAt: now,
  });

  res.json({ status: 'active' });
}

export async function createReportOrder(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const { amount, currency } = getReportPrice();
  if (!amount || !currency) throw new PricingNotConfiguredError();

  const order = await createOrder(amount, currency, `report_${req.uid}_${Date.now()}`, {
    uid: req.uid,
    purpose: 'report',
  });
  res.json(order);
}

export async function verifyReportPayment(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const input = verifySchema.parse(req.body);
  verifyPaymentSignature(input);

  const db = adminFirestore();
  await db.collection('payments').add({
    userId: req.uid,
    orderId: input.orderId,
    razorpayPaymentId: input.paymentId,
    purpose: 'report',
    status: 'paid',
    createdAt: FieldValue.serverTimestamp(),
  });

  await markReportPending(req.uid);

  // Awaited (rather than fire-and-forget) because a serverless instance can
  // be frozen the moment a response is sent, which would silently drop a
  // background task. A production upgrade path is to hand this off to
  // Cloud Tasks so the HTTP response can return immediately.
  await generateAndStoreReport(req.uid);
  res.json({ status: 'ready' });
}
