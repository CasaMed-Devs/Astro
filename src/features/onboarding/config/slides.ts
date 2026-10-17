export interface OnboardingSlide {
  id: string;
  title: string;
  image: number;
  /** width / height of the source PNG, so it can be laid out edge-to-edge without cropping or letterboxing. */
  aspectRatio: number;
}

export const onboardingSlides: OnboardingSlide[] = [
  {
    id: 'ask-anything',
    title: 'Ask anything',
    image: require('../../../../assets/images/onboarding/ask-anything.png'),
    aspectRatio: 390 / 525,
  },
  {
    id: 'know-your-future',
    title: 'Know your future',
    image: require('../../../../assets/images/onboarding/know-your-future.png'),
    aspectRatio: 390 / 544,
  },
  {
    id: 'ai-astrologer',
    title: 'Talk to an AI astrologer',
    image: require('../../../../assets/images/onboarding/ai-astrologer.png'),
    aspectRatio: 390 / 586,
  },
];
