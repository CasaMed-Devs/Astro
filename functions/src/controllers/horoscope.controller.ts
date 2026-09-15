import type { Request, Response } from 'express';

import { getDailyHoroscope } from '../services/horoscope.service';
import { NotFoundError } from '../utils/errors';
import { zodiacSignIds } from '../config/zodiac';

export async function getTodayHoroscope(req: Request, res: Response): Promise<void> {
  const { sign } = req.params;
  if (!zodiacSignIds.includes(sign)) {
    throw new NotFoundError('Unknown zodiac sign.');
  }

  const horoscope = await getDailyHoroscope(sign);
  res.json(horoscope);
}
