import { PropsWithChildren } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radii, shadows, spacing } from '@/constants/theme';

type CardProps = PropsWithChildren<{
  style?: ViewStyle;
  padded?: boolean;
}>;

export function Card({ children, style, padded = true }: CardProps) {
  return <View style={[styles.card, padded && styles.padded, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    ...shadows.card,
  },
  padded: {
    padding: spacing.lg,
  },
});
