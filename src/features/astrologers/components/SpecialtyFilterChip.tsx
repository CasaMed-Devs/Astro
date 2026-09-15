import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { colors, radii, spacing } from '@/constants/theme';

type SpecialtyFilterChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

export function SpecialtyFilterChip({ label, selected, onPress }: SpecialtyFilterChipProps) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <AppText variant="body" color={selected ? colors.onGradientText : colors.textSecondary}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 36,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.primary },
});
