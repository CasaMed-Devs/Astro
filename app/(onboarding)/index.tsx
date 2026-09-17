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

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { Screen } from '@/components/common/Screen';
import { ProgressDots } from '@/features/onboarding/components/ProgressDots';
import { onboardingSlides } from '@/features/onboarding/config/slides';
import { colors, radii, spacing } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
      <View style={styles.header}>
        <Pressable onPress={handleSkip} hitSlop={12} testID="onboarding-skip">
          <AppText variant="body" color={colors.textSecondary}>
            Skip
          </AppText>
        </Pressable>
      </View>
      <FlatList
        ref={listRef}
        data={onboardingSlides}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
            <View style={styles.imageCard}>
              <Image source={item.image} style={styles.image} resizeMode="cover" />
            </View>
            <View style={styles.textBlock}>
              <AppText variant="displayLg" style={styles.title}>
                {item.title}
              </AppText>
              <AppText variant="body" color={colors.textSecondary} style={styles.description}>
                {item.description}
              </AppText>
            </View>
          </View>
        )}
      />
      <View style={styles.footer}>
        <ProgressDots count={onboardingSlides.length} activeIndex={activeIndex} />
        <Button
          label={isLastSlide ? 'Create my account' : 'Continue'}
          onPress={handleContinue}
          style={styles.continueButton}
          testID="onboarding-continue"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'flex-end', paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  slide: { flex: 1 },
  imageCard: {
    marginHorizontal: spacing.xl,
    aspectRatio: 1,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  image: { width: '100%', height: '100%' },
  textBlock: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, gap: spacing.md },
  title: { fontSize: 34, lineHeight: 40 },
  description: { fontSize: 16, lineHeight: 24 },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.lg },
  continueButton: { width: '100%' },
});
