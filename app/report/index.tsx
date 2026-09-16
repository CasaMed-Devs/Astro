import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, MapPin, Calendar, Clock, RefreshCw } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { Screen } from '@/components/common/Screen';
import { LoadingView } from '@/components/states/LoadingView';
import { NorthIndianChart } from '@/components/astrology/NorthIndianChart';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { apiClient } from '@/services/apiClient';
import { subscribeToReport } from '@/services/report.service';
import { colors, radii, spacing, shadows } from '@/constants/theme';
import type { ReportDoc, ReportDasha } from '@/types/firestore';

const SIGN_NAMES = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

export default function ReportScreen() {
  const { session } = useAuth();
  const [report, setReport] = useState<ReportDoc | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    return subscribeToReport(setReport);
  }, [session]);

  useEffect(() => {
    if (report === null && !error) {
      apiClient.post('/reports/generate').catch((err) => setError(err.message || 'API Error'));
    }
  }, [report, error]);

  const handleRetry = () => {
    setError(null);
    apiClient.post('/reports/generate').catch((err) => setError(err.message || 'API Error'));
  };

  const handleRegenerate = () => {
    apiClient.post('/reports/generate').catch((err) => setError(err.message || 'API Error'));
  };

  if (error) {
    return (
      <Screen>
        <HeaderRow />
        <AppText variant="displayMd" color={colors.danger} style={styles.title}>
          Could not connect
        </AppText>
        <AppText variant="body" color={colors.textSecondary} style={styles.subtitle}>
          {error}
        </AppText>
        <Button label="Retry" onPress={handleRetry} />
      </Screen>
    );
  }

  if (report === undefined || report === null) {
    return (
      <Screen>
        <HeaderRow />
        <LoadingView message={report === null ? 'Initializing your Kundali...' : undefined} />
      </Screen>
    );
  }

  if (report.status === 'pending') {
    return (
      <Screen>
        <HeaderRow />
        <LoadingView message="Generating your Kundali. This may take a minute..." />
      </Screen>
    );
  }

  if (report.status === 'failed') {
    return (
      <Screen>
        <HeaderRow />
        <AppText variant="displayMd" color={colors.danger} style={styles.title}>
          Generation Failed
        </AppText>
        <AppText variant="body" color={colors.textSecondary} style={styles.subtitle}>
          The backend failed to calculate your Kundali. Check the backend logs.
        </AppText>
        <Button label="Try Again" onPress={handleRetry} />
      </Screen>
    );
  }

  const kundali = report.kundali;
  const ascendant = kundali?.planets.find((p) => p.name === 'Ascendant');
  const lagnaSignName = ascendant ? (SIGN_NAMES[(ascendant.currentSign - 1) % 12] ?? '—') : '—';

  // Old report doc exists but has no kundali data — prompt regeneration
  if (!kundali) {
    return (
      <Screen>
        <HeaderRow />
        <AppText variant="displayMd" style={styles.title}>Your Janma Kundali</AppText>
        <AppText variant="body" color={colors.textSecondary} style={styles.subtitle}>
          Your chart data needs to be refreshed to display the full Vedic chart.
        </AppText>
        <Button label="Generate Chart" onPress={handleRegenerate} />
      </Screen>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <HeaderRow />

      {/* Title */}
      <AppText variant="displayMd" style={styles.title}>Your Janma Kundali</AppText>
      {kundali ? (
        <AppText variant="bodySmall" color={colors.textSecondary} style={styles.subtitle}>
          {kundali.geo.completeName}
        </AppText>
      ) : null}

      {/* Chart */}
      {kundali ? (
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <AppText variant="label" color={colors.primary}>Lagna: {lagnaSignName}</AppText>
            <AppText variant="bodySmall" color={colors.textMuted}>North Indian Chart</AppText>
          </View>
          <NorthIndianChart kundali={kundali} size={300} />
        </View>
      ) : null}

      {/* Planetary Positions */}
      {kundali?.planets && kundali.planets.length > 0 ? (
        <View style={styles.section}>
          <AppText variant="cardTitle" style={styles.sectionTitle}>Planetary Positions</AppText>
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <AppText variant="bodySmall" color={colors.textMuted} style={styles.col1}>Planet</AppText>
              <AppText variant="bodySmall" color={colors.textMuted} style={styles.col2}>Sign</AppText>
              <AppText variant="bodySmall" color={colors.textMuted} style={styles.col3}>Degree</AppText>
              <AppText variant="bodySmall" color={colors.textMuted} style={styles.col4}>House</AppText>
            </View>
            {kundali.planets
              .filter((p) => p.name !== 'Ascendant')
              .map((planet) => (
                <View key={planet.name} style={styles.tableRow}>
                  <AppText variant="body" style={[styles.col1, planet.isRetrograde && styles.retrograde]}>
                    {planet.name}{planet.isRetrograde ? ' ℞' : ''}
                  </AppText>
                  <AppText variant="body" color={colors.textSecondary} style={styles.col2}>
                    {SIGN_NAMES[(planet.currentSign - 1) % 12] ?? '—'}
                  </AppText>
                  <AppText variant="body" color={colors.textSecondary} style={styles.col3}>
                    {planet.normDegree.toFixed(1)}°
                  </AppText>
                  <AppText variant="body" color={colors.textSecondary} style={styles.col4}>
                    {planet.houseNumber ?? '—'}
                  </AppText>
                </View>
              ))}
          </View>
        </View>
      ) : null}

      {/* Dasha Periods */}
      {kundali?.mahaDasas && kundali.mahaDasas.length > 0 ? (
        <View style={styles.section}>
          <AppText variant="cardTitle" style={styles.sectionTitle}>Vimsottari Maha Dasha</AppText>
          <View style={styles.dashaList}>
            {kundali.mahaDasas.map((dasha, i) => (
              <DashaRow key={i} dasha={dasha} index={i} />
            ))}
          </View>
        </View>
      ) : null}

      {/* AI Report text if available */}
      {report.content && !report.content.startsWith('**AI Provider') ? (
        <View style={styles.section}>
          <AppText variant="cardTitle" style={styles.sectionTitle}>Your Personal Reading</AppText>
          <AppText variant="body" color={colors.textSecondary} style={styles.reportText}>
            {report.content}
          </AppText>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Pressable onPress={() => router.push('/(tabs)/astrologers')} style={styles.astroBtn}>
          <AppText variant="label" color={colors.primary}>Chat with an Astrologer →</AppText>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function DashaRow({ dasha, index }: { dasha: ReportDasha; index: number }) {
  const now = new Date();
  const start = new Date(dasha.startTime);
  const end = new Date(dasha.endTime);
  const isCurrent = now >= start && now <= end;
  return (
    <View style={[styles.dashaRow, isCurrent && styles.dashaRowCurrent]}>
      <View style={styles.dashaLeft}>
        <AppText variant="label" color={isCurrent ? colors.primary : colors.textPrimary}>
          {dasha.lord}
        </AppText>
        {isCurrent ? (
          <View style={styles.currentBadge}>
            <AppText variant="caption" color={colors.primary}>Current</AppText>
          </View>
        ) : null}
      </View>
      <AppText variant="bodySmall" color={colors.textMuted}>
        {dasha.startTime.slice(0, 4)} – {dasha.endTime.slice(0, 4)}
      </AppText>
    </View>
  );
}

function HeaderRow() {
  return (
    <Pressable onPress={() => router.back()} style={styles.backRow}>
      <ArrowLeft size={18} color={colors.textSecondary} />
      <AppText variant="body" color={colors.textSecondary}>Back</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.backgroundFrom },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md, marginBottom: spacing.sm },
  title: { marginTop: spacing.sm },
  subtitle: { marginTop: spacing.xs, marginBottom: spacing.lg },
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    alignItems: 'center',
    ...shadows.card,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginBottom: spacing.md,
  },
  section: { marginBottom: spacing.xl },
  sectionTitle: { marginBottom: spacing.sm },
  table: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    overflow: 'hidden',
    ...shadows.card,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tableHeader: { backgroundColor: colors.surfaceMuted },
  col1: { flex: 3 },
  col2: { flex: 3 },
  col3: { flex: 2 },
  col4: { flex: 1, textAlign: 'center' },
  retrograde: { color: colors.primaryDark },
  dashaList: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    overflow: 'hidden',
    ...shadows.card,
  },
  dashaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dashaRowCurrent: { backgroundColor: colors.surfaceAlt },
  dashaLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  currentBadge: {
    backgroundColor: 'rgba(178,95,10,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  reportText: { lineHeight: 22 },
  footer: { alignItems: 'center', marginTop: spacing.md },
  astroBtn: {
    padding: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: spacing.xl,
  },
});
