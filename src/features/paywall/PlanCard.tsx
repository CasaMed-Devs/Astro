import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { colors, fonts, radii, spacing } from '@/constants/theme';

type PlanCardProps = {
  title: string;
  subtitle: string;
  /** Already formatted, e.g. "₹49". */
  price: string;
};

/**
 * The selected-plan card shared by both paywalls (trial and upgrade): a
 * highlighted plan row sitting on a muted footer strip with the auto-pay note.
 */
export function PlanCard({ title, subtitle, price }: PlanCardProps) {
  return (
    <View style={styles.container}>
      <View style={styles.plan}>
        <View style={styles.planCopy}>
          <AppText style={styles.title}>{title}</AppText>
          <AppText style={styles.subtitle}>{subtitle}</AppText>
        </View>
        <AppText style={styles.price}>{price}</AppText>
      </View>
      <View style={styles.footer}>
        <AppText style={styles.footerText}>Auto pay as per UPI Mandate</AppText>
        <AppText style={styles.footerText}>Cancel anytime</AppText>
      </View>
    </View>
  );
}

/** Same footprint as PlanCard, shown while pricing loads. */
export function PlanCardSkeleton() {
  return <View style={styles.skeleton} />;
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceMuted,
  },
  plan: {
    // Overlaps the container's own border so the highlighted edge reads as a
    // single outline, as in the design.
    margin: -1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  planCopy: { flex: 1, gap: 2 },
  title: {
    fontFamily: fonts.bodyBold,
    fontSize: 19,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  subtitle: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  price: {
    fontFamily: fonts.bodyBold,
    fontSize: 22,
    lineHeight: 28,
    color: colors.primaryDark,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs + 1,
    paddingBottom: spacing.xs + 2,
  },
  footerText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textPrimary,
  },
  skeleton: {
    height: 92,
    width: '100%',
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceAlt,
  },
});
