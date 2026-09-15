import { useCallback, useRef, useState } from 'react';
import { Dimensions, FlatList, Image, StyleSheet, View, type ViewToken } from 'react-native';
import { router } from 'expo-router';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { Screen } from '@/components/common/Screen';
import { ProgressDots } from '@/features/onboarding/components/ProgressDots';
import { onboardingSlides } from '@/features/onboarding/config/slides';
import { colors, spacing } from '@/constants/theme';

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

  return (
    <Screen padded={false} edges={['top', 'bottom']}>
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
            <Image source={item.image} style={styles.image} resizeMode="cover" />
            <View style={styles.textBlock}>
              <AppText variant="displayMd">{item.title}</AppText>
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
  slide: { flex: 1 },
  image: { width: '100%', height: '52%' },
  textBlock: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, gap: spacing.sm },
  description: { lineHeight: 22 },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.lg },
  continueButton: { width: '100%' },
});
