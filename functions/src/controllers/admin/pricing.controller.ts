import type { Request, Response } from 'express';
import { z } from 'zod';

import { getServerPlan, getReportPrice } from '../../config/plans';
import { setPaywallPricing } from '../../services/paywallPricing.service';

const priceSchema = z.object({
  amount: z.number().positive().optional(),
  currency: z.string().min(1).optional(),
});

const updatePricingSchema = z.object({
  subscription: priceSchema.optional(),
  report: priceSchema.optional(),
});

export async function getPricing(_req: Request, res: Response): Promise<void> {
  const [subscription, report] = await Promise.all([
    getServerPlan('astro101-plus-monthly'),
    getReportPrice(),
  ]);

  res.json({
    subscription: { amount: subscription?.amount, currency: subscription?.currency },
    report,
  });
}

export async function updatePricing(req: Request, res: Response): Promise<void> {
  const update = updatePricingSchema.parse(req.body);
  await setPaywallPricing(update);
  res.json({ ok: true });
}
