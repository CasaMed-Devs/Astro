import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';

import { gradients, spacing } from '@/constants/theme';

type ScreenProps = PropsWithChildren<{
  style?: ViewStyle;
  edges?: Edge[];
  scroll?: boolean;
  padded?: boolean;
}>;

export function Screen({
  children,
  style,
  edges = ['top', 'bottom'],
  scroll = false,
  padded = true,
}: ScreenProps) {
  const Container = scroll ? ScrollView : View;
  const containerProps = scroll
    ? { contentContainerStyle: [padded && styles.padded, style] }
    : { style: [styles.fill, padded && styles.padded, style] };

  return (
    <LinearGradient colors={gradients.background} style={styles.fill}>
      <SafeAreaView edges={edges} style={styles.fill}>
        <Container {...containerProps}>{children}</Container>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  padded: { paddingHorizontal: spacing.xl },
});
