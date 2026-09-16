import { FieldValue } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';
import { generateAstrologerReply } from './ai.service';

const GENERIC_HOROSCOPE_PROMPT =
  'You are an AI astrologer writing a short daily horoscope. Write 3-4 sentences of warm, general ' +
  'guidance for someone with this zodiac sign for today, covering mood, relationships, and one ' +
  'practical tip. Do not mention specific dates or claim certainty about events.';

const FALLBACK_HOROSCOPES: Record<string, string> = {
  aries: 'A surge of inner clarity arrives today — trust the instinct that has been quietly guiding you. In your relationships, directness will open a door that hesitation has kept closed. A small, deliberate step forward carries more power than a grand gesture left undone.',
  taurus: 'Today invites you to slow down and listen to what the body already knows. Beauty is not a distraction — it is your compass. Let a conversation you have been avoiding become the foundation of something more honest.',
  gemini: 'Two ideas you have been holding separately may reveal their connection today. Let curiosity lead without needing a destination. Someone who challenges your view is offering you a gift — it is worth unwrapping.',
  cancer: 'The tide of feeling is not a weakness; it is your clearest form of intelligence. Tend to the home within before tending to the home around you. A gentle boundary set today will protect something precious tomorrow.',
  leo: 'Your presence is noticed even when you are simply being yourself. Channel that warmth into something that outlasts the moment. Creative energy is high — begin something, even imperfectly.',
  virgo: 'Precision serves you today, but do not let the perfect become the enemy of the meaningful. A detail you have overlooked holds the key to a problem you thought was solved. Rest is not retreat — it sharpens the mind you rely on.',
  libra: 'Balance is not a still point — it is a continuous, graceful adjustment. A relationship asks for your honesty, not your harmony. Trust that beauty and truth are not opposites today.',
  scorpio: 'What you sense beneath the surface is real. Do not dismiss the quiet intelligence gathering in the background. A transformation is underway — steady hands will carry it further than urgent ones.',
  sagittarius: 'Distance gives you the perspective others are searching for today. Share what you see without needing to convince. An old belief is loosening — let it, and see what grows in the space it leaves.',
  capricorn: 'The structure you have built is more valuable than it appears from the inside. Acknowledge the progress, not just the remaining distance. A quieter day is not a lost day — some foundations are laid in silence.',
  aquarius: 'The idea that seems unconventional is closer to the truth than convention allows. Seek out one conversation today that breaks your usual orbit. Community is not agreement; it is the honest gathering of different minds.',
  pisces: 'The veil between feeling and knowing is thin today — trust what moves through you. Art, music, or stillness will carry more information than words. A dream from the night may hold something worth writing down.',
};

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
    const data = existing.data() as DailyHoroscope;
    // Don't return cached AI-error messages
    if (!data.content.startsWith('**AI Provider')) return data;
  }

  let content: string;
  try {
    content = await generateAstrologerReply(
      GENERIC_HOROSCOPE_PROMPT,
      [],
      `Write today's horoscope for ${sign}.`,
    );
    // If the AI returned its "not configured" placeholder, use our curated fallback
    if (content.startsWith('**AI Provider')) throw new Error('no-ai');
  } catch {
    content = FALLBACK_HOROSCOPES[sign] ?? 'The stars are aligning something meaningful for you today. Stay open and present.';
  }

  const horoscope: DailyHoroscope = { sign, date, content };
  await ref.set({ ...horoscope, createdAt: FieldValue.serverTimestamp() });
  return horoscope;
}
