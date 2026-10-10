import { createContext, PropsWithChildren, useCallback, useContext, useRef } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';

import { gradients, spacing } from '@/constants/theme';

type ScreenProps = PropsWithChildren<{
  style?: ViewStyle;
  edges?: Edge[];
  scroll?: boolean;
  padded?: boolean;
  /** Set false for screens that handle the keyboard themselves (e.g. chat). */
  avoidKeyboard?: boolean;
}>;

type ScrollIntoView = (target: View | null, topOffset?: number) => void;

const ScreenScrollContext = createContext<ScrollIntoView | null>(null);

/**
 * Lets a child of a scrolling Screen bring itself to the top of the visible
 * area (e.g. a dropdown that would otherwise open underneath the keyboard).
 * A no-op inside a Screen that doesn't scroll.
 */
export function useScrollIntoView(): ScrollIntoView {
  return useContext(ScreenScrollContext) ?? noop;
}

function noop() {}

export function Screen({
  children,
  style,
  edges = ['top', 'bottom'],
  scroll = false,
  padded = true,
  avoidKeyboard = true,
}: ScreenProps) {
  const scrollRef = useRef<ScrollView>(null);
  const scrollIntoView = useCallback<ScrollIntoView>((target, topOffset = 0) => {
    const scrollView = scrollRef.current;
    if (!target || !scrollView) return;
    // Measured against the content view, so `y` is the target's position in
    // the scrollable content whatever the current scroll offset is.
    // (getInnerViewRef exists at runtime but is missing from RN's typings.)
    const content = (
      scrollView as ScrollView & { getInnerViewRef(): View | null }
    ).getInnerViewRef();
    if (!content) return;
    target.measureLayout(content, (_x, y) => {
      scrollView.scrollTo({ y: Math.max(0, y - topOffset), animated: true });
    });
  }, []);

  const Container = scroll ? ScrollView : View;
  const containerProps = scroll
    ? {
        ref: scrollRef,
        contentContainerStyle: [padded && styles.padded, style],
        keyboardShouldPersistTaps: 'handled' as const,
        keyboardDismissMode: 'on-drag' as const,
      }
    : { style: [styles.fill, padded && styles.padded, style] };

  return (
    <ScreenScrollContext.Provider value={scroll ? scrollIntoView : null}>
      <LinearGradient colors={gradients.background} style={styles.fill}>
        <SafeAreaView edges={edges} style={styles.fill}>
          {/* Shrinks the scroll area above the keyboard so content (e.g. place
            suggestions) stays reachable by scrolling instead of being covered. */}
          {avoidKeyboard ? (
            <KeyboardAvoidingView style={styles.fill} behavior="padding">
              <Container {...containerProps}>{children}</Container>
            </KeyboardAvoidingView>
          ) : (
            <Container {...containerProps}>{children}</Container>
          )}
        </SafeAreaView>
      </LinearGradient>
    </ScreenScrollContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  padded: { paddingHorizontal: spacing.xl },
});
