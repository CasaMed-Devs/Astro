import { forwardRef } from 'react';
import { StyleSheet, TextInput, TextInputProps, View, ViewStyle } from 'react-native';

import { colors, fonts, radii, spacing } from '@/constants/theme';

type InputProps = TextInputProps & {
  leftAccessory?: React.ReactNode;
  rightAccessory?: React.ReactNode;
  containerStyle?: ViewStyle;
};

export const Input = forwardRef<TextInput, InputProps>(
  ({ leftAccessory, rightAccessory, containerStyle, style, ...rest }, ref) => {
    return (
      <View style={[styles.container, containerStyle]}>
        {leftAccessory}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, style]}
          {...rest}
        />
        {rightAccessory}
      </View>
    );
  },
);
Input.displayName = 'Input';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.lg,
    height: 52,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.textPrimary,
  },
});
