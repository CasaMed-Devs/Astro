import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, Lock, ScrollText, Star } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { Screen } from '@/components/common/Screen';
import { LoadingView } from '@/components/states/LoadingView';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { reportUnlockOffer } from '@/features/payments/config/plans';
import {
  createReportOrder,
  openRazorpayCheckout,
  verifyReportPayment,
} from '@/services/payment.service';
import { subscribeToReport } from '@/services/report.service';
import { colors, radii, spacing } from '@/constants/theme';
import { AppError } from '@/utils/errors';
import type { ReportDoc } from '@/types/firestore';

const REPORT_SECTIONS = [
  {
    icon: ScrollText,
    title: '40-page life report',
    subtitle: 'Career, wealth, marriage and health',
  },
  { icon: Star, title: 'Dasha timeline', subtitle: 'Which years favour which decisions' },
  { icon: Lock, title: 'Personal remedies', subtitle: 'Gemstones, mantras and puja guidance' },
];

export default function ReportScreen() {
  const { session } = useAuth();
  const [report, setReport] = useState<ReportDoc | null | undefined>(undefined);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pricingReady = reportUnlockOffer.price != null && reportUnlockOffer.currency != null;

  useEffect(() => {
    if (!session) return;
    return subscribeToReport(setReport);
  }, [session]);

  const handleUnlock = async () => {
    if (!pricingReady) return;
    setProcessing(true);
    setError(null);
    try {
      const order = await createReportOrder();
      const result = await openRazorpayCheckout(order, {
        name: 'Astro101',
        description: reportUnlockOffer.name,
        contact: session?.phoneNumber ?? undefined,
      });
      await verifyReportPayment(result);
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Could not unlock your report.');
    } finally {
      setProcessing(false);
    }
  };

  if (report === undefined) {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  }

  if (report?.status === 'ready') {
    return (
      <Screen scroll>
        <HeaderRow />
        <AppText variant="displayMd" style={styles.title}>
          Your kundali report
        </AppText>
        <AppText variant="body" color={colors.textSecondary} style={styles.readyContent}>
          {report.content}
        </AppText>
      </Screen>
    );
  }

  if (report?.status === 'pending') {
    return (
      <Screen>
        <HeaderRow />
        <LoadingView message="Generating your report. This can take a minute..." />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <HeaderRow />
      <AppText variant="displayMd" style={styles.title}>
        Your kundali is ready
      </AppText>
      <AppText variant="body" color={colors.textSecondary}>
        We have cast your chart. Unlock the detailed report, or head straight to the astrologers.
      </AppText>

      <View style={styles.sections}>
        {REPORT_SECTIONS.map(({ icon: Icon, title, subtitle }) => (
          <View key={title} style={styles.sectionRow}>
            <Icon size={20} color={colors.textSecondary} />
            <View style={styles.sectionText}>
              <AppText variant="label">{title}</AppText>
              <AppText variant="bodySmall" color={colors.textSecondary}>
                {subtitle}
              </AppText>
            </View>
          </View>
        ))}
      </View>

      {pricingReady ? (
        <View style={styles.priceCard}>
          <AppText variant="displayMd" color={colors.primaryDark}>
            {reportUnlockOffer.currency}
            {reportUnlockOffer.price}
          </AppText>
          <AppText variant="bodySmall" color={colors.textSecondary}>
            One-time · lifetime access to your report
          </AppText>
        </View>
      ) : (
        <View style={styles.priceCard}>
          <AppText variant="cardTitle">Pricing coming soon</AppText>
        </View>
      )}

      {error ? (
        <AppText variant="bodySmall" color={colors.danger}>
          {error}
        </AppText>
      ) : null}

      <View style={styles.footer}>
        <Button
          label="Unlock full report"
          onPress={handleUnlock}
          loading={processing}
          disabled={!pricingReady}
        />
        <Pressable onPress={() => router.push('/(tabs)/astrologers')}>
          <AppText variant="body" color={colors.textSecondary} style={styles.skipLabel}>
            Maybe later, show me astrologers
          </AppText>
        </Pressable>
      </View>
    </Screen>
  );
}

function HeaderRow() {
  return (
    <Pressable onPress={() => router.back()} style={styles.backRow}>
      <ArrowLeft size={18} color={colors.textSecondary} />
      <AppText variant="body" color={colors.textSecondary}>
        Back
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  title: { marginTop: spacing.lg, marginBottom: spacing.sm },
  sections: { gap: spacing.md, marginTop: spacing.xl },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  sectionText: { flex: 1, gap: 2 },
  priceCard: {
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  footer: { marginTop: spacing.xl, marginBottom: spacing.xxl, gap: spacing.md },
  skipLabel: { textAlign: 'center' },
  readyContent: { marginTop: spacing.md, lineHeight: 22 },
});
