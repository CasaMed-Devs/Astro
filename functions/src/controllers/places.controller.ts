import type { Request, Response } from 'express';
import { z } from 'zod';

import { autocompletePlaces, resolvePlace } from '../services/places.service';
import { UnauthorizedError } from '../utils/errors';

const autocompleteQuerySchema = z.object({ input: z.string().min(1).max(200) });

const resolveQuerySchema = z.object({
  placeId: z.string().min(1),
  timestamp: z.coerce.number().int().optional(),
});

export async function autocomplete(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const { input } = autocompleteQuerySchema.parse(req.query);
  const predictions = await autocompletePlaces(input);
  res.json({ predictions });
}

export async function resolve(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const { placeId, timestamp } = resolveQuerySchema.parse(req.query);
  const place = await resolvePlace(placeId, timestamp ?? Math.floor(Date.now() / 1000));
  res.json(place);
}
