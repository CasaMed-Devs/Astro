/**
 * Design tokens extracted from the Astro101 Figma file
 * (file key Wsv2rE8AswBECuWU5xSwxh). Keep this the single source of
 * truth for color/type/spacing so screens never hardcode raw values.
 */

export const colors = {
  primary: '#B25F0A',
  primaryDark: '#BC5E20',
  textPrimary: '#1E1E1E',
  textSecondary: '#676779',
  textMuted: '#A0A0A4',
  surface: '#FFFFFD',
  surfaceMuted: '#FEFAF2',
  surfaceAlt: '#FEECDC',
  backgroundFrom: '#FEFCF3',
  backgroundTo: '#FAF0E2',
  chipBg: 'rgba(255,255,255,0.7)',
  chipText: '#B25F0A',
  progressActive: '#B25F0A',
  progressInactive: '#EFE6D5',
  onGradientText: '#FEFBF3',
  border: 'rgba(30,30,30,0.08)',
  danger: '#D14343',
  overlay: 'rgba(30,30,30,0.5)',
} as const;

export const fonts = {
  display: 'CormorantGaramond_700Bold',
  wordmark: 'CormorantSC_600SemiBold',
  bodyMedium: 'PlusJakartaSans_500Medium',
  bodySemiBold: 'PlusJakartaSans_600SemiBold',
  bodyBold: 'PlusJakartaSans_700Bold',
  bodyRegular: 'PlusJakartaSans_400Regular',
} as const;

export const typography = {
  displayLg: { fontFamily: fonts.display, fontSize: 32, lineHeight: 39 },
  displayMd: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36 },
  wordmark: { fontFamily: fonts.wordmark, fontSize: 24, lineHeight: 29 },
  body: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20 },
  bodySmall: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16 },
  caption: { fontFamily: fonts.bodyMedium, fontSize: 10, lineHeight: 13 },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 20 },
  buttonLabel: { fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 14, lineHeight: 18 },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 32,
} as const;

export const radii = {
  sm: 12,
  md: 16,
  lg: 22,
  pill: 999,
} as const;

export const shadows = {
  card: {
    shadowColor: '#1E1E1E',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} as const;

export const gradients = {
  background: [colors.backgroundFrom, colors.backgroundTo] as const,
  primaryButton: [colors.primary, colors.primaryDark] as const,
};
