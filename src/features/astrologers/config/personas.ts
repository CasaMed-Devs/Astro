import type { AstrologerPersona } from '@/features/astrologers/types';

/**
 * AI astrologer personas. Each card in the Figma "Astrologers" list maps to
 * a distinct AI persona (own specialty/tone/language), not a real human.
 * `promptProfileId` is resolved to an actual system prompt server-side in
 * functions/src/config/personas.ts — keep the two lists in sync by id.
 */
export const astrologerPersonas: AstrologerPersona[] = [
  {
    id: 'ramesh-shastri',
    name: 'Pandit Ramesh Shastri',
    tagline: 'Vedic kundali & match-making specialist',
    languages: ['Hindi', 'Sanskrit', 'English'],
    specialties: ['kundali', 'vedic', 'matchMaking'],
    avatar: 'ramesh-shastri',
    creditCostPerMessage: 2,
    promptProfileId: 'vedic-traditional-male',
  },
  {
    id: 'meera-iyer',
    name: 'Meera Iyer',
    tagline: 'Tarot reader for love & career questions',
    languages: ['English', 'Tamil', 'Hindi'],
    specialties: ['tarot', 'numerology', 'kundali'],
    avatar: 'meera-iyer',
    creditCostPerMessage: 1,
    promptProfileId: 'tarot-warm-female',
  },
  {
    id: 'arjun-dev',
    name: 'Arjun Dev',
    tagline: 'Tarot and Vastu for home & work decisions',
    languages: ['Hindi', 'English', 'Punjabi'],
    specialties: ['tarot', 'vastu'],
    avatar: 'arjun-dev',
    creditCostPerMessage: 1,
    promptProfileId: 'tarot-direct-male',
  },
  {
    id: 'savitri-devi',
    name: 'Savitri Devi',
    tagline: 'Palmistry & Vedic kundali veteran',
    languages: ['Hindi', 'Marathi'],
    specialties: ['palmistry', 'kundali', 'vedic'],
    avatar: 'savitri-devi',
    creditCostPerMessage: 2,
    promptProfileId: 'vedic-traditional-female',
  },
  {
    id: 'nikhil-joshi',
    name: 'Nikhil Joshi',
    tagline: 'Numerology and Vastu for practical planning',
    languages: ['English', 'Hindi', 'Gujarati'],
    specialties: ['numerology', 'vedic', 'vastu'],
    avatar: 'nikhil-joshi',
    creditCostPerMessage: 1,
    promptProfileId: 'numerology-analytical-male',
  },
  {
    id: 'kavita-nair',
    name: 'Kavita Nair',
    tagline: 'Tarot & match-making for relationship clarity',
    languages: ['English', 'Malayalam', 'Hindi'],
    specialties: ['tarot', 'vastu', 'matchMaking'],
    avatar: 'kavita-nair',
    creditCostPerMessage: 1,
    promptProfileId: 'tarot-warm-female-2',
  },
];

export const personaAvatarSources: Record<string, number> = {
  'ramesh-shastri': require('../../../../assets/images/personas/ramesh-shastri.png'),
  'meera-iyer': require('../../../../assets/images/personas/meera-iyer.png'),
  'arjun-dev': require('../../../../assets/images/personas/arjun-dev.png'),
  'savitri-devi': require('../../../../assets/images/personas/savitri-devi.png'),
  'nikhil-joshi': require('../../../../assets/images/personas/nikhil-joshi.png'),
  'kavita-nair': require('../../../../assets/images/personas/kavita-nair.png'),
};

export function getPersonaById(id: string): AstrologerPersona | undefined {
  return astrologerPersonas.find((persona) => persona.id === id);
}
