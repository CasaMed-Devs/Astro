import { Text, TextProps, TextStyle } from 'react-native';

import { colors, typography } from '@/constants/theme';

type Variant = keyof typeof typography;

type AppTextProps = TextProps & {
  variant?: Variant;
  color?: string;
};

export function AppText({
  variant = 'body',
  color = colors.textPrimary,
  style,
  ...rest
}: AppTextProps) {
  const variantStyle = typography[variant] as TextStyle;
  return <Text {...rest} style={[variantStyle, { color }, style]} />;
}
