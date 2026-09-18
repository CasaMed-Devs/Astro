import type { Request, Response } from 'express';
import { z } from 'zod';

import { listProfiles } from '../../services/personaApi.service';
import { getAllPersonaConfigs, setPersonaOrder } from '../../services/personaConfig.service';

const PERSONA_API_ORIGIN = 'https://personaapi.web.app';

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
      sortOrder: config?.sortOrder ?? Number.MAX_SAFE_INTEGER,
    };
  });

  merged.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  res.json({ astrologers: merged });
}

export async function updateAstrologerOrder(req: Request, res: Response): Promise<void> {
  const { order } = updateOrderSchema.parse(req.body);

  await setPersonaOrder(order);
  res.json({ ok: true });
}
