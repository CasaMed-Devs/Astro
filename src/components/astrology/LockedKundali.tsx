import { StyleSheet, View } from 'react-native';
import { Lock } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { NorthIndianChart } from '@/components/astrology/NorthIndianChart';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import type { ReportKundali } from '@/types/firestore';

// Fake chart shown behind the lock. The user's real kundali is never sent to
// the app until they've paid, so nothing here is real data.
const SAMPLE_KUNDALI: ReportKundali = {
  geo: { latitude: 28.6, longitude: 77.2, timezoneOffset: 5.5, completeName: 'Sample City, India' },
  planets: [
    { name: 'Ascendant', fullDegree: 132, normDegree: 12, isRetrograde: false, currentSign: 5, houseNumber: 1 },
    { name: 'Sun', fullDegree: 100, normDegree: 10, isRetrograde: false, currentSign: 4, houseNumber: 12 },
    { name: 'Moon', fullDegree: 250, normDegree: 10, isRetrograde: false, currentSign: 9, houseNumber: 5 },
    { name: 'Mars', fullDegree: 280, normDegree: 10, isRetrograde: false, currentSign: 10, houseNumber: 6 },
    { name: 'Mercury', fullDegree: 95, normDegree: 5, isRetrograde: false, currentSign: 4, houseNumber: 12 },
    { name: 'Jupiter', fullDegree: 40, normDegree: 10, isRetrograde: false, currentSign: 2, houseNumber: 10 },
    { name: 'Venus', fullDegree: 130, normDegree: 10, isRetrograde: false, currentSign: 5, houseNumber: 1 },
    { name: 'Saturn', fullDegree: 320, normDegree: 20, isRetrograde: true, currentSign: 11, houseNumber: 7 },
    { name: 'Rahu', fullDegree: 15, normDegree: 15, isRetrograde: true, currentSign: 1, houseNumber: 9 },
    { name: 'Ketu', fullDegree: 195, normDegree: 15, isRetrograde: true, currentSign: 7, houseNumber: 3 },
  ],
  mahaDasas: [],
};

interface LockedKundaliProps {
  priceLabel: string; // e.g. "₹49"
  paying: boolean;
  error: string | null;
  onPay: () => void;
}

/**
 * The kundali screen for users who haven't unlocked it yet: a sample chart
 * behind a frosted overlay, with a single "Pay ₹49" call to action on top.
 * The frost is drawn with a translucent layer (no native blur module needed).
 */
export function LockedKundali({ priceLabel, paying, error, onPay }: LockedKundaliProps) {
  return (
    <View style={styles.root}>
      <View style={styles.sample} pointerEvents="none">
        <AppText variant="displayMd" style={styles.sampleTitle}>
          Your Janma Kundali
        </AppText>
        <View style={styles.chartCard}>
          <NorthIndianChart kundali={SAMPLE_KUNDALI} size={280} />
        </View>
        {[0, 1].map((i) => (
          <View key={i} style={styles.infoCard}>
            <View style={styles.line} />
            <View style={[styles.line, styles.lineShort]} />
            <View style={styles.line} />
          </View>
        ))}
      </View>

      <View style={styles.frost} pointerEvents="none" />

      <View style={styles.overlay}>
        <View style={styles.ctaCard}>
          <View style={styles.lockIcon}>
            <Lock size={26} color={colors.primary} />
          </View>
          <AppText variant="cardTitle" style={styles.ctaTitle}>
            Unlock your Janma Kundali
          </AppText>
          <AppText variant="bodySmall" color={colors.textSecondary} style={styles.ctaBody}>
            One-time payment. Lifetime access to your personal chart.
          </AppText>
          {error ? (
            <AppText variant="bodySmall" color={colors.danger} style={styles.ctaError}>
              {error}
            </AppText>
          ) : null}
          <Button
            label={`Pay ${priceLabel} to access your kundali`}
            onPress={onPay}
            loading={paying}
            style={styles.ctaButton}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, marginTop: spacing.sm },
  sample: { opacity: 0.55 },
  sampleTitle: { marginBottom: spacing.md },
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  line: { height: 12, borderRadius: 6, backgroundColor: colors.surfaceAlt },
  lineShort: { width: '60%' },
  frost: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    backgroundColor: 'rgba(254, 252, 243, 0.72)',
  },
  overlay: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  ctaCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadows.card,
  },
  lockIcon: {
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  ctaTitle: { textAlign: 'center' },
  ctaBody: { textAlign: 'center' },
  ctaError: { textAlign: 'center' },
  ctaButton: { alignSelf: 'stretch', marginTop: spacing.md },
});
