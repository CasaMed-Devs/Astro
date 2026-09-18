import type { Request, Response } from 'express';
import { z } from 'zod';

import {
  getReportPrice,
  getRupeesPerCredit,
  getSubscriptionAmount,
  getTopUpConfig,
  getTrialAmount,
} from '../../config/plans';
import { setPaywallPricing } from '../../services/paywallPricing.service';

const priceSchema = z.object({
  amount: z.number().positive().optional(),
  currency: z.string().min(1).optional(),
});

const creditPricingSchema = z.object({
  rupeesPerCredit: z.number().positive().optional(),
});

const topUpSchema = z.object({
  minAmount: z.number().int().positive().optional(),
  maxAmount: z.number().int().positive().optional(),
  presetAmounts: z.array(z.number().int().positive()).optional(),
  currency: z.string().min(1).optional(),
});

const updatePricingSchema = z.object({
  creditPricing: creditPricingSchema.optional(),
  trialAmount: priceSchema.optional(),
  subscriptionAmount: priceSchema.optional(),
  report: priceSchema.optional(),
  topUp: topUpSchema.optional(),
});

export async function getPricing(_req: Request, res: Response): Promise<void> {
  const [rupeesPerCredit, trialAmount, subscriptionAmount, report, topUp] = await Promise.all([
    getRupeesPerCredit(),
    getTrialAmount(),
    getSubscriptionAmount(),
    getReportPrice(),
    getTopUpConfig(),
  ]);

  res.json({
    creditPricing: { rupeesPerCredit },
    trialAmount,
    subscriptionAmount,
    report,
    topUp,
  });
}

export async function updatePricing(req: Request, res: Response): Promise<void> {
  const update = updatePricingSchema.parse(req.body);
  await setPaywallPricing(update);
  res.json({ ok: true });
}
