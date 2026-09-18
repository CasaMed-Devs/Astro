import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import { adminFirestore } from '../config/firebase-admin';
import { getReportPrice, getServerPlan, getTopUpConfig } from '../config/plans';
import {
  createOrder,
  createSubscription,
  fetchOrder,
  paiseToRupees,
  verifyPaymentSignature,
  verifySubscriptionSignature,
} from '../services/razorpay.service';
import { creditWallet } from '../services/credits.service';
import { generateAndStoreReport, markReportPending } from '../services/report.service';
import { HttpError, UnauthorizedError, ValidationError } from '../utils/errors';

const verifySchema = z.object({
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
  signature: z.string().min(1),
});

const verifySubscriptionSchema = z.object({
  subscriptionId: z.string().min(1),
  paymentId: z.string().min(1),
  signature: z.string().min(1),
});

const topUpOrderSchema = z.object({
  amount: z.number().positive(), // Rupees
});

class PricingNotConfiguredError extends HttpError {
  constructor() {
    super(503, 'Pricing has not been configured yet. Please check back soon.');
  }
}

export async function createSubscriptionOrder(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const { planId } = z.object({ planId: z.string().min(1) }).parse(req.body);
  const plan = await getServerPlan(planId);
  if (!plan?.razorpayPlanId) throw new PricingNotConfiguredError();

  const subscription = await createSubscription(plan.razorpayPlanId, {
    uid: req.uid,
    purpose: 'subscription',
    planId,
  });

  await adminFirestore()
    .collection('subscriptions')
    .doc(req.uid)
    .set(
      {
        planId,
        status: 'pending',
        razorpaySubscriptionId: subscription.subscriptionId,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  res.json(subscription);
}

export async function verifySubscriptionPayment(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const input = verifySubscriptionSchema.parse(req.body);
  verifySubscriptionSignature(input);

  const db = adminFirestore();
  const now = FieldValue.serverTimestamp();

  await db.collection('subscriptions').doc(req.uid).set(
    {
      status: 'active',
      razorpaySubscriptionId: input.subscriptionId,
      currentPeriodStart: now,
      graceUntil: FieldValue.delete(),
      updatedAt: now,
    },
    { merge: true },
  );

  // Idempotent: doc id is the Razorpay payment id, so a retried verify call
  // (e.g. after a network blip) never writes a duplicate ledger entry.
  await db
    .collection('payments')
    .doc(input.paymentId)
    .set(
      {
        userId: req.uid,
        razorpaySubscriptionId: input.subscriptionId,
        razorpayPaymentId: input.paymentId,
        purpose: 'subscription',
        status: 'paid',
        createdAt: now,
      },
      { merge: true },
    );

  res.json({ status: 'active' });
}

export async function createTopUpOrder(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const { amount } = topUpOrderSchema.parse(req.body);
  const config = await getTopUpConfig();

  if (amount < config.minAmount || amount > config.maxAmount) {
    throw new ValidationError(
      `Amount must be between ${config.minAmount} and ${config.maxAmount} ${config.currency}.`,
    );
  }

  const order = await createOrder(amount, config.currency, `topup_${req.uid}_${Date.now()}`, {
    uid: req.uid,
    purpose: 'topup',
  });

  res.json(order);
}

export async function verifyTopUpPayment(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const input = verifySchema.parse(req.body);
  verifyPaymentSignature(input);

  // Re-fetch the order from Razorpay for the authoritative paid amount —
  // never trust a client-supplied amount when crediting a wallet.
  const order = await fetchOrder(input.orderId);
  const notes = order.notes as Record<string, string> | undefined;
  if (notes?.uid !== req.uid || notes?.purpose !== 'topup') {
    throw new ValidationError('This order does not belong to a top-up for this account.');
  }

  const config = await getTopUpConfig();
  const amountRupees = paiseToRupees(Number(order.amount));
  const result = await creditWallet(req.uid, amountRupees, input.paymentId, config.creditsPerRupee);

  res.json({
    status: 'ok',
    creditsAwarded: result.creditsAwarded,
    newBalance: result.newBalance,
  });
}

export async function getTopUpConfigHandler(_req: Request, res: Response): Promise<void> {
  const config = await getTopUpConfig();
  res.json(config);
}

/**
 * Read-only, end-user-facing mirror of the admin-editable pricing doc, so
 * the paywall/report/top-up screens can display the real admin-set amounts
 * instead of a hardcoded "coming soon" state. No secrets here — safe for any
 * authenticated user.
 */
export async function getPublicPricing(_req: Request, res: Response): Promise<void> {
  const [subscription, report] = await Promise.all([
    getServerPlan('astro101-plus-monthly'),
    getReportPrice(),
  ]);

  res.json({
    subscription: { amount: subscription?.amount, currency: subscription?.currency },
    report,
  });
}

export async function createReportOrder(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const { amount, currency } = await getReportPrice();
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
