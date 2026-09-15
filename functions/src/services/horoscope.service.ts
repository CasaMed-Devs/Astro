import { FieldValue } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';
import { generateAstrologerReply } from './ai.service';

const GENERIC_HOROSCOPE_PROMPT =
  'You are an AI astrologer writing a short daily horoscope. Write 3-4 sentences of warm, general ' +
  'guidance for someone with this zodiac sign for today, covering mood, relationships, and one ' +
  'practical tip. Do not mention specific dates or claim certainty about events.';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface DailyHoroscope {
  sign: string;
  date: string;
  content: string;
}

export async function getDailyHoroscope(sign: string): Promise<DailyHoroscope> {
  const date = todayKey();
  const db = adminFirestore();
  const ref = db.collection('horoscopes').doc(sign).collection('daily').doc(date);

  const existing = await ref.get();
  if (existing.exists) {
    return existing.data() as DailyHoroscope;
  }

  const content = await generateAstrologerReply(
    GENERIC_HOROSCOPE_PROMPT,
    [],
    `Write today's horoscope for ${sign}.`,
  );

  const horoscope: DailyHoroscope = { sign, date, content };
  await ref.set({ ...horoscope, createdAt: FieldValue.serverTimestamp() });
  return horoscope;
}
