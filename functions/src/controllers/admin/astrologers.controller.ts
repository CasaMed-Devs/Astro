import type { Request, Response } from 'express';
import { z } from 'zod';

import { listProfiles } from '../../services/personaApi.service';
import {
  DEFAULT_CREDIT_COST_PER_SESSION,
  getAllPersonaConfigs,
  setCreditCostPerSession,
  setPersonaOrder,
} from '../../services/personaConfig.service';

const PERSONA_API_ORIGIN = 'https://personaapi.web.app';

const updatePriceSchema = z.object({
  creditCostPerSession: z.number().int().min(1).max(1000),
});

const updateOrderSchema = z.object({
  order: z.array(z.string().min(1)).min(1),
});

export async function listAstrologers(_req: Request, res: Response): Promise<void> {
  const [{ profiles }, configs] = await Promise.all([listProfiles(), getAllPersonaConfigs()]);

  const merged = profiles.map((profile) => {
    const config = configs.get(profile.id);
    return {
      id: profile.id,
      name: profile.name,
      tagline: profile.tagline,
      city: profile.city,
      photoUrl: `${PERSONA_API_ORIGIN}${profile.photo_url}`,
      creditCostPerSession: config?.creditCostPerSession ?? DEFAULT_CREDIT_COST_PER_SESSION,
      sortOrder: config?.sortOrder ?? Number.MAX_SAFE_INTEGER,
    };
  });

  merged.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  res.json({ astrologers: merged });
}

export async function updateAstrologerPrice(req: Request, res: Response): Promise<void> {
  const { profileId } = req.params;
  const { creditCostPerSession } = updatePriceSchema.parse(req.body);

  await setCreditCostPerSession(profileId, creditCostPerSession);
  res.json({ ok: true });
}

export async function updateAstrologerOrder(req: Request, res: Response): Promise<void> {
  const { order } = updateOrderSchema.parse(req.body);

  await setPersonaOrder(order);
  res.json({ ok: true });
}
