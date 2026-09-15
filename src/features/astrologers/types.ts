export type PersonaSpecialty =
  'kundali' | 'tarot' | 'palmistry' | 'numerology' | 'vastu' | 'matchMaking' | 'vedic';

export interface AstrologerPersona {
  id: string;
  name: string;
  tagline: string;
  languages: string[];
  specialties: PersonaSpecialty[];
  avatar: string;
  /** Credits deducted from a free-tier user's balance per user message sent to this persona. */
  creditCostPerMessage: number;
  /** Identifies the system-prompt/tone template used server-side; never sent to the AI provider directly by the client. */
  promptProfileId: string;
}

export const SPECIALTY_LABELS: Record<PersonaSpecialty, string> = {
  kundali: 'Kundali',
  tarot: 'Tarot',
  palmistry: 'Palmistry',
  numerology: 'Numerology',
  vastu: 'Vastu',
  matchMaking: 'Match Making',
  vedic: 'Vedic',
};
