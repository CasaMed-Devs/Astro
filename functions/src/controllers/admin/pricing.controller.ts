import type { Request, Response } from 'express';
import { z } from 'zod';

import { getServerPlan, getReportPrice, getTopUpConfig } from '../../config/plans';
import { setPaywallPricing } from '../../services/paywallPricing.service';

const priceSchema = z.object({
  amount: z.number().positive().optional(),
  currency: z.string().min(1).optional(),
});

const subscriptionPriceSchema = priceSchema.extend({
  razorpayPlanId: z.string().min(1).optional(),
});

const topUpSchema = z.object({
  minAmount: z.number().int().positive().optional(),
  maxAmount: z.number().int().positive().optional(),
  creditsPerRupee: z.number().positive().optional(),
  presetAmounts: z.array(z.number().int().positive()).optional(),
  currency: z.string().min(1).optional(),
});

const updatePricingSchema = z.object({
  subscription: subscriptionPriceSchema.optional(),
  report: priceSchema.optional(),
  topUp: topUpSchema.optional(),
});

export async function getPricing(_req: Request, res: Response): Promise<void> {
  const [subscription, report, topUp] = await Promise.all([
    getServerPlan('astro101-plus-monthly'),
    getReportPrice(),
    getTopUpConfig(),
  ]);

  res.json({
    subscription: {
      amount: subscription?.amount,
      currency: subscription?.currency,
      razorpayPlanId: subscription?.razorpayPlanId,
    },
    report,
    topUp,
  });
}

export async function updatePricing(req: Request, res: Response): Promise<void> {
  const update = updatePricingSchema.parse(req.body);
  await setPaywallPricing(update);
  res.json({ ok: true });
}
