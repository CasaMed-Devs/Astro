import { Image, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { colors, spacing } from '@/constants/theme';

/**
 * Shown while custom fonts load, in place of the native splash screen
 * (see app/_layout.tsx). Mirrors the native splash's logo + background so
 * there's no visible flash when one hands off to the other.
 */
export function SplashView() {
  return (
    <View style={styles.container}>
      <Image
        source={require('../../../assets/images/android-icon-foreground.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <AppText variant="wordmark" color={colors.primary} style={styles.appName}>
        Astro108
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundFrom,
    gap: spacing.lg,
  },
  logo: {
    width: 160,
    height: 160,
  },
  appName: {
    letterSpacing: 0.5,
  },
});
