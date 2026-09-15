import { FieldValue } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';
import { generateAstrologerReply } from './ai.service';
import { calculateKundali, type KundaliData } from './astrology.service';
import { parseBirthDateTime } from '../utils/birthDateTime';
import { NotFoundError, ValidationError } from '../utils/errors';
import type { UserProfileRecord } from '../types';

const REPORT_SYSTEM_PROMPT =
  'You are an AI Vedic astrologer writing a detailed personal life report from a real, ' +
  "calculated birth chart (not a guess). Ground every claim in the chart data provided — don't " +
  'invent planetary positions or dasha periods that contradict it. Structure the report with ' +
  'clear sections: Career & Wealth, Marriage & Relationships, Health, and General Remedies. Write ' +
  'in a warm, professional tone, around 600-900 words total, addressing the user by name and using ' +
  'the pronoun matching their stated gender. Frame everything as astrological guidance for ' +
  'reflection, not certainty or medical/legal advice.';

const SIGN_NAMES = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
];

function formatChartForPrompt(kundali: KundaliData): string {
  const planetLines = kundali.planets
    .map((planet) => {
      const sign = SIGN_NAMES[(planet.currentSign - 1 + 12) % 12] ?? `sign #${planet.currentSign}`;
      const retro = planet.isRetrograde ? ' (retrograde)' : '';
      const house = planet.houseNumber ? `, house ${planet.houseNumber}` : '';
      return `- ${planet.name}: ${sign}, ${planet.normDegree.toFixed(2)}°${house}${retro}`;
    })
    .join('\n');

  const dashaLines = kundali.mahaDasas
    .slice(0, 6)
    .map(
      (period) =>
        `- ${period.lord}: ${period.startTime.slice(0, 10)} to ${period.endTime.slice(0, 10)}`,
    )
    .join('\n');

  return [
    `Birth location: ${kundali.geo.completeName}`,
    '',
    'Planetary positions (Rasi chart):',
    planetLines,
    '',
    'Vimsottari Maha Dasa periods:',
    dashaLines,
  ].join('\n');
}

export async function markReportPending(uid: string): Promise<void> {
  await adminFirestore().collection('reports').doc(uid).set({ status: 'pending' }, { merge: true });
}

export async function generateAndStoreReport(uid: string): Promise<void> {
  const db = adminFirestore();
  const userSnapshot = await db.collection('users').doc(uid).get();
  if (!userSnapshot.exists) throw new NotFoundError('User profile not found.');

  const user = userSnapshot.data() as UserProfileRecord;
  const reportRef = db.collection('reports').doc(uid);

  try {
    if (!user.dateOfBirth || !user.timeOfBirth || !user.placeOfBirth) {
      throw new ValidationError(
        'Complete birth details (date, time, place) are required for a kundali report.',
      );
    }

    const birth = parseBirthDateTime(user.dateOfBirth, user.timeOfBirth);
    const kundali = await calculateKundali(birth, user.placeOfBirth);

    const prompt = [
      `Name: ${user.name ?? 'the user'}. Gender: ${user.gender ?? 'unspecified'}.`,
      `Date of birth: ${user.dateOfBirth}. Time of birth: ${user.timeOfBirth}.`,
      '',
      formatChartForPrompt(kundali),
      '',
      'Write the full life report now, grounded in this chart.',
    ].join('\n');

    const content = await generateAstrologerReply(REPORT_SYSTEM_PROMPT, [], prompt);
    await reportRef.set(
      { status: 'ready', content, generatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  } catch (error) {
    await reportRef.set({ status: 'failed' }, { merge: true });
    throw error;
  }
}
