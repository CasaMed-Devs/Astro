import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import { adminFirestore } from '../config/firebase-admin';
import {
  getReportPrice,
  getRupeesPerCredit,
  getSubscriptionAmount,
  getTopUpConfig,
  getTrialAmount,
} from '../config/plans';
import {
  createOrder,
  fetchOrder,
  paiseToRupees,
  verifyPaymentSignature,
} from '../services/razorpay.service';
import { creditWallet } from '../services/credits.service';
import {
  startTrial,
  startSubscriptionOrder,
  startTrialOrder,
  upgradeNow,
  verifySubscriptionPayment,
  verifyTrialRegistration,
} from '../services/mandate.service';
import { unlockKundali } from '../services/report.service';
import { HttpError, UnauthorizedError, ValidationError } from '../utils/errors';

const verifySchema = z.object({
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
  signature: z.string().min(1),
});

const mandateMethodSchema = z.enum(['card', 'upi']);

const startTrialSchema = z.object({
  method: mandateMethodSchema,
});

const upgradeNowSchema = z.object({
  // Only needed when no mandate exists yet (registration path); ignored
  // when an active mandate is charged directly.
  method: mandateMethodSchema.optional(),
});

const topUpOrderSchema = z.object({
  amount: z.number().positive(), // Rupees
});

class PricingNotConfiguredError extends HttpError {
  constructor() {
    super(503, 'Pricing has not been configured yet. Please check back soon.');
  }
}

/**
 * Starts the Rs.1 trial: registers a card/UPI auto-debit mandate via a
 * Razorpay hosted registration page. The 5 trial credits and the day-2
 * Rs.299 schedule are only set once Razorpay confirms via webhook.
 */
export async function startTrialPayment(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const { method } = startTrialSchema.parse(req.body);
  const result = await startTrial(req.uid, method);
  res.json(result);
}

/** Rs.1 trial via the in-app Razorpay Checkout SDK (no hosted-page redirect). */
export async function startTrialOrderHandler(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const { method } = startTrialSchema.parse(req.body);
  res.json(await startTrialOrder(req.uid, method));
}

/** Rs.299 subscription via the in-app Razorpay Checkout (always a real payment). */
export async function startSubscriptionOrderHandler(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const { method } = upgradeNowSchema.parse(req.body);
  res.json(await startSubscriptionOrder(req.uid, method));
}

export async function verifySubscriptionPaymentHandler(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const input = verifySchema.parse(req.body);
  res.json(await verifySubscriptionPayment(req.uid, input));
}

/** Confirms the Rs.1 trial right after checkout (the webhook remains the fallback). */
export async function verifyTrialPaymentHandler(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const input = verifySchema.parse(req.body);
  res.json(await verifyTrialRegistration(req.uid, input));
}

/**
 * "Subscribe Rs.299 now" — charges the existing mandate immediately and
 * restarts the 30-day cycle, or starts a direct (trial-skipping) mandate
 * registration if none exists yet.
 */
export async function upgradeNowHandler(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const { method } = upgradeNowSchema.parse(req.body);
  const result = await upgradeNow(req.uid, method);
  res.json(result);
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

  const rupeesPerCredit = await getRupeesPerCredit();
  const amountRupees = paiseToRupees(Number(order.amount));
  const result = await creditWallet(req.uid, amountRupees, input.paymentId, 1 / rupeesPerCredit);

  res.json({
    status: 'ok',
    creditsAwarded: result.creditsAwarded,
    newBalance: result.newBalance,
  });
}

export async function getTopUpConfigHandler(_req: Request, res: Response): Promise<void> {
  const [config, rupeesPerCredit] = await Promise.all([getTopUpConfig(), getRupeesPerCredit()]);
  res.json({ ...config, rupeesPerCredit });
}

/** The signed-in user's most recent wallet top-ups, newest first. */
export async function getTopUpHistory(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const snap = await adminFirestore()
    .collection('payments')
    .where('userId', '==', req.uid)
    .where('purpose', '==', 'topup')
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  res.json(
    snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        amount: Number(data.amount ?? 0),
        creditsAwarded: Number(data.creditsAwarded ?? 0),
        status: String(data.status ?? 'paid'),
        createdAt: data.createdAt?.toDate?.().toISOString() ?? null,
      };
    }),
  );
}

/**
 * Read-only, end-user-facing mirror of the admin-editable pricing doc, so
 * the paywall/report/top-up screens display the real admin-set amounts. No
 * secrets here — safe for any authenticated user.
 */
export async function getPublicPricing(_req: Request, res: Response): Promise<void> {
  const [trial, subscription, report, rupeesPerCredit] = await Promise.all([
    getTrialAmount(),
    getSubscriptionAmount(),
    getReportPrice(),
    getRupeesPerCredit(),
  ]);

  res.json({ trial, subscription, report, rupeesPerCredit });
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

  // The order must be this user's kundali order, at the fixed unlock price.
  const order = await fetchOrder(input.orderId);
  const notes = order.notes as Record<string, string> | undefined;
  if (notes?.uid !== req.uid || notes?.purpose !== 'report') {
    throw new ValidationError('This order does not belong to a kundali unlock for this account.');
  }

  await recordKundaliPayment(req.uid, input.orderId, input.paymentId, paiseToRupees(Number(order.amount)));
  res.json({ status: 'ok' });
}

/**
 * Logs the Rs.49 payment (idempotent — the doc id is the Razorpay payment id,
 * so a retry or the webhook can't double-record) and grants lifetime access.
 * Chart generation is deliberately NOT done here: the report screen triggers
 * it once unlocked, keeping this request fast.
 */
export async function recordKundaliPayment(
  uid: string,
  orderId: string,
  paymentId: string,
  amountRupees: number,
): Promise<void> {
  await adminFirestore()
    .collection('payments')
    .doc(paymentId)
    .set(
      {
        userId: uid,
        orderId,
        razorpayPaymentId: paymentId,
        purpose: 'report',
        amount: amountRupees,
        status: 'paid',
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  await unlockKundali(uid);
}
