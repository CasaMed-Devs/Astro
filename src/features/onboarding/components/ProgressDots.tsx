import { StyleSheet, View } from 'react-native';

import { colors, radii } from '@/constants/theme';

type ProgressDotsProps = {
  count: number;
  activeIndex: number;
};

export function ProgressDots({ count, activeIndex }: ProgressDotsProps) {
  return (
    <View style={styles.row}>
      {Array.from({ length: count }).map((_, index) => (
        <View
          key={index}
          style={[styles.dot, index === activeIndex ? styles.dotActive : styles.dotInactive]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  dot: { height: 6, borderRadius: radii.pill },
  dotActive: { width: 42, backgroundColor: colors.progressActive },
  dotInactive: { width: 20, backgroundColor: colors.progressInactive },
});
