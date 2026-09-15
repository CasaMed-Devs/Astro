export interface OnboardingSlide {
  id: string;
  title: string;
  description: string;
  image: number;
}

export const onboardingSlides: OnboardingSlide[] = [
  {
    id: 'stars-decoded',
    title: 'Your stars, decoded',
    description:
      'Vedic charts read with AI trained on decades of shastra knowledge — clear answers, not guesswork.',
    image: require('../../../../assets/images/onboarding/stars-decoded.png'),
  },
  {
    id: 'pick-skill',
    title: 'Pick the right skill',
    description:
      'Filter by Kundali, Tarot, Palmistry, Numerology or Vastu and choose the AI astrologer who fits your question.',
    image: require('../../../../assets/images/onboarding/pick-skill.png'),
  },
  {
    id: 'ask-anything',
    title: 'Ask anything, anytime',
    description:
      'No waiting for a human. Start a chat, ask freely, and get your answer the moment you need it.',
    image: require('../../../../assets/images/onboarding/ask-anything.png'),
  },
];
