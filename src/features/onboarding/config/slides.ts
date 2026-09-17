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
      'Vedic charts read by astrologers who have spent decades with the shastras — not guesswork.',
    image: require('../../../../assets/images/onboarding/stars-decoded.png'),
  },
  {
    id: 'pick-skill',
    title: 'Pick the right skill',
    description:
      'Filter by Kundali, Tarot, Palmistry, Numerology or Vastu and choose the expert who fits your question.',
    image: require('../../../../assets/images/onboarding/pick-skill.png'),
  },
  {
    id: 'talk-by-the-minute',
    title: 'Talk by the minute',
    description:
      'No long packages. Start a chat, pay only for the minutes you use, end whenever you have your answer.',
    image: require('../../../../assets/images/onboarding/ask-anything.png'),
  },
];
