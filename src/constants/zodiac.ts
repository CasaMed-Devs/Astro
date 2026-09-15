export interface ZodiacSign {
  id: string;
  label: string;
  symbol: string;
}

export const zodiacSigns: ZodiacSign[] = [
  { id: 'aries', label: 'Aries', symbol: '♈' },
  { id: 'taurus', label: 'Taurus', symbol: '♉' },
  { id: 'gemini', label: 'Gemini', symbol: '♊' },
  { id: 'cancer', label: 'Cancer', symbol: '♋' },
  { id: 'leo', label: 'Leo', symbol: '♌' },
  { id: 'virgo', label: 'Virgo', symbol: '♍' },
  { id: 'libra', label: 'Libra', symbol: '♎' },
  { id: 'scorpio', label: 'Scorpio', symbol: '♏' },
  { id: 'sagittarius', label: 'Sagittarius', symbol: '♐' },
  { id: 'capricorn', label: 'Capricorn', symbol: '♑' },
  { id: 'aquarius', label: 'Aquarius', symbol: '♒' },
  { id: 'pisces', label: 'Pisces', symbol: '♓' },
];
