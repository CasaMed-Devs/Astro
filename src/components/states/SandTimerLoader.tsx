import { StyleSheet, View } from 'react-native';
import LottieView from 'lottie-react-native';

import { AppText } from '@/components/common/AppText';
import { colors, spacing } from '@/constants/theme';

import sandTimer from '../../../assets/images/loading.json';

type Rgb = [number, number, number];

/** '#B25F0A' → [0.698, 0.373, 0.039] — Lottie stores colours as 0–1 RGB. */
function hexToLottie(hex: string): Rgb {
  const value = parseInt(hex.replace('#', ''), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

const sameColor = (a: number[], b: number[]) => a.length >= 3 && a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) < 0.01);

// The source animation's own colours, swapped for the app theme's.
const SOURCE_SAND: Rgb = [0.898, 0.298, 0]; // orange sand + frame
const SOURCE_GLASS: Rgb = [0.9333, 0.9333, 0.9333]; // grey glass

/** Deep-copies the animation, replacing every static fill/stroke colour that matches a source colour. */
function recolor(node: unknown, swaps: [Rgb, Rgb][]): unknown {
  if (Array.isArray(node)) return node.map((child) => recolor(child, swaps));
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) out[key] = recolor(value, swaps);
    // Colour props look like { c: { a: 0, k: [r, g, b] } }.
    const color = obj.c as { a?: number; k?: unknown } | undefined;
    if (color && color.a === 0 && Array.isArray(color.k)) {
      const swap = swaps.find(([from]) => sameColor(color.k as number[], from));
      if (swap) out.c = { ...color, k: [...swap[1], ...(color.k as number[]).slice(3)] };
    }
    return out;
  }
  return node;
}

// Computed once at load time from the theme, so the loader follows brand colour changes.
const THEMED_SAND_TIMER = recolor(sandTimer, [
  [SOURCE_SAND, hexToLottie(colors.primary)],
  [SOURCE_GLASS, hexToLottie(colors.surfaceAlt)],
]) as typeof sandTimer;

type SandTimerLoaderProps = {
  message?: string;
  size?: number;
};

/** Full-area loader with the brand-coloured sand-timer animation. */
export function SandTimerLoader({ message, size = 96 }: SandTimerLoaderProps) {
  return (
    <View style={styles.container}>
      <LottieView source={THEMED_SAND_TIMER} autoPlay loop style={{ width: size, height: size }} />
      {message ? (
        <AppText variant="body" color={colors.textSecondary} style={styles.message}>
          {message}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  message: { textAlign: 'center' },
});
