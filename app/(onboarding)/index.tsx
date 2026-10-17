import { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  View,
  type ViewToken,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { Screen } from '@/components/common/Screen';
import { ProgressDots } from '@/features/onboarding/components/ProgressDots';
import { onboardingSlides } from '@/features/onboarding/config/slides';
import { colors, spacing } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Eased (non-linear) alpha stops so the image dissolves into the page
// background gradually instead of showing a visible soft "edge".
const FADE_LOCATIONS = [0, 0.3, 0.55, 0.75, 1] as const;
const FADE_ALPHAS = [0, 0.12, 0.35, 0.68, 1] as const;

function withAlpha(hex: string, alpha: number) {
  const value = hex.replace('#', '');
  const r = parseInt(value.substring(0, 2), 16);
  const g = parseInt(value.substring(2, 4), 16);
  const b = parseInt(value.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const fadeBottomColors = FADE_ALPHAS.map((alpha) => withAlpha(colors.backgroundTo, alpha)) as [
  string,
  string,
  ...string[],
];
const fadeTopColors = [...FADE_ALPHAS]
  .reverse()
  .map((alpha) => withAlpha(colors.backgroundFrom, alpha)) as [string, string, ...string[]];

export default function OnboardingCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList>(null);
  const isLastSlide = activeIndex === onboardingSlides.length - 1;

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems[0]?.index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
    [],
  );

  const handleContinue = () => {
    if (isLastSlide) {
      router.push('/(onboarding)/mobile-number');
      return;
    }
    listRef.current?.scrollToIndex({ index: activeIndex + 1 });
  };

  const handleSkip = () => {
    router.push('/(onboarding)/mobile-number');
  };

  return (
    <Screen padded={false} edges={['top', 'bottom']}>
      <Pressable onPress={handleSkip} hitSlop={12} style={styles.skip} testID="onboarding-skip">
        <AppText variant="body" color={colors.textSecondary}>
          Skip
        </AppText>
      </Pressable>
      <FlatList
        ref={listRef}
        data={onboardingSlides}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        style={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
            <View style={styles.brand}>
              <Image
                source={require('../../assets/images/android-icon-foreground.png')}
                style={styles.logo}
                resizeMode="contain"
              />
              <AppText variant="wordmark" color={colors.primary} style={styles.wordmark}>
                Astro108
              </AppText>
              <AppText variant="displayLg" style={styles.title}>
                {item.title}
              </AppText>
            </View>
            <View style={[styles.imageWrap, { aspectRatio: item.aspectRatio }]}>
              <Image source={item.image} style={styles.image} resizeMode="cover" />
              <LinearGradient
                colors={fadeBottomColors}
                locations={FADE_LOCATIONS}
                style={styles.fadeBottom}
                pointerEvents="none"
              />
              <LinearGradient
                colors={fadeTopColors}
                locations={FADE_LOCATIONS}
                style={styles.fadeTop}
                pointerEvents="none"
              />
            </View>
          </View>
        )}
      />
      <View style={styles.footer}>
        <ProgressDots count={onboardingSlides.length} activeIndex={activeIndex} />
        <Button
          label="Continue"
          onPress={handleContinue}
          style={styles.continueButton}
          testID="onboarding-continue"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  skip: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.xl,
    zIndex: 10,
  },
  list: { flex: 1 },
  slide: { flex: 1, justifyContent: 'center' },
  brand: { alignItems: 'center', gap: spacing.xs, paddingTop: spacing.lg },
  logo: { width: 84, height: 84 },
  wordmark: { fontSize: 30, lineHeight: 36, letterSpacing: 0.6 },
  title: { fontSize: 38, lineHeight: 45, marginTop: spacing.sm },
  imageWrap: { width: '100%', marginTop: spacing.lg, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  fadeBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '32%' },
  fadeTop: { position: 'absolute', left: 0, right: 0, top: 0, height: '20%' },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.lg },
  continueButton: { width: '100%' },
});
