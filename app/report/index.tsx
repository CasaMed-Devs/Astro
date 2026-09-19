import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, MapPin, Calendar, Clock, RefreshCw } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { Screen } from '@/components/common/Screen';
import { LoadingView } from '@/components/states/LoadingView';
import { LockedKundali } from '@/components/astrology/LockedKundali';
import { NorthIndianChart } from '@/components/astrology/NorthIndianChart';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { apiClient } from '@/services/apiClient';
import {
  createReportOrder,
  getPricing,
  openRazorpayCheckout,
  verifyReportPayment,
} from '@/services/payment.service';
import { AppError } from '@/utils/errors';
import { subscribeToReport } from '@/services/report.service';
import { colors, radii, spacing, shadows } from '@/constants/theme';
import type { ReportDoc, ReportDasha } from '@/types/firestore';

const SIGN_NAMES = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
];

const SANSKRIT_SIGNS = [
  'Mesha',
  'Vrishabha',
  'Mithuna',
  'Karka',
  'Simha',
  'Kanya',
  'Tula',
  'Vrischika',
  'Dhanu',
  'Makara',
  'Kumbha',
  'Meena',
];

const NAKSHATRA_NAMES = [
  'Ashwini',
  'Bharani',
  'Krittika',
  'Rohini',
  'Mrigashira',
  'Ardra',
  'Punarvasu',
  'Pushya',
  'Ashlesha',
  'Magha',
  'Purva Phalguni',
  'Uttara Phalguni',
  'Hasta',
  'Chitra',
  'Swati',
  'Vishakha',
  'Anuradha',
  'Jyeshtha',
  'Mula',
  'Purva Ashadha',
  'Uttara Ashadha',
  'Shravana',
  'Dhanishta',
  'Shatabhisha',
  'Purva Bhadrapada',
  'Uttara Bhadrapada',
  'Revati',
];

const PLANET_ABBR: Record<string, string> = {
  Sun: 'Su',
  Moon: 'Mo',
  Mars: 'Ma',
  Mercury: 'Me',
  Jupiter: 'Ju',
  Venus: 'Ve',
  Saturn: 'Sa',
  Rahu: 'Ra',
  Ketu: 'Ke',
};

const SIGN_RULERS: Record<string, string> = {
  Aries: 'Mars',
  Taurus: 'Venus',
  Gemini: 'Mercury',
  Cancer: 'Moon',
  Leo: 'Sun',
  Virgo: 'Mercury',
  Libra: 'Venus',
  Scorpio: 'Mars',
  Sagittarius: 'Jupiter',
  Capricorn: 'Saturn',
  Aquarius: 'Saturn',
  Pisces: 'Jupiter',
};

const CAREER_TRAITS: Record<string, string> = {
  Aries: 'suited to leadership roles and fast-paced work.',
  Taurus: 'rewards steady, patient effort over time.',
  Gemini: 'favors variety, communication and adaptable roles.',
  Cancer: 'thrives in nurturing, people-focused work.',
  Leo: 'calls for visibility, creativity and recognition.',
  Virgo: 'rewards precision, service and attention to detail.',
  Libra: 'favors partnership-driven or diplomatic work.',
  Scorpio: 'demands depth, research and transformation.',
  Sagittarius: 'suited to teaching, travel or big-picture roles.',
  Capricorn: 'built for steady, disciplined long-term growth.',
  Aquarius: 'favors innovation and unconventional paths.',
  Pisces: 'suited to creative, healing or spiritual work.',
};

const RELATIONSHIP_TRAITS: Record<string, string> = {
  Aries: 'partnerships are direct and full of energy.',
  Taurus: 'bonds built on stability and loyalty.',
  Gemini: 'connection thrives on conversation and variety.',
  Cancer: 'closeness built through emotional security.',
  Leo: 'relationships flourish with warmth and admiration.',
  Virgo: 'care shown through practical support.',
  Libra: 'balance and fairness matter most in bonds.',
  Scorpio: 'bonds deepen through trust and intensity.',
  Sagittarius: 'freedom and shared adventure matter.',
  Capricorn: 'partnerships mature slowly, built to last.',
  Aquarius: 'connection thrives on friendship and space.',
  Pisces: 'bonds are gentle, intuitive and compassionate.',
};

function findCurrentDasha(dashas: ReportDasha[]): ReportDasha | null {
  const now = new Date();
  return dashas.find((d) => now >= new Date(d.startTime) && now <= new Date(d.endTime)) ?? null;
}

export default function ReportScreen() {
  const { session, profile } = useAuth();
  const [report, setReport] = useState<ReportDoc | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [price, setPrice] = useState(49);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    getPricing()
      .then((pricing) => {
        if (pricing.report.amount) setPrice(pricing.report.amount);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!session) return;
    // Stop polling once the report reaches a terminal state — otherwise
    // this keeps re-fetching (and re-rendering the whole screen, including
    // the SVG chart) every few seconds forever, which is wasteful and can
    // trigger native view-tree crashes in react-native-svg under repeated
    // re-renders.
    let unsubscribe: (() => void) | undefined;
    unsubscribe = subscribeToReport((next) => {
      setReport(next);
      if (next && (next.status === 'ready' || next.status === 'failed')) {
        unsubscribe?.();
      }
    });
    return () => unsubscribe?.();
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

  // Real Razorpay payment; the backend unlocks the kundali only after it
  // verifies the payment. Then clearing `report` makes the effect above kick
  // off generation — no navigation, just a state change.
  const handleUnlock = async () => {
    setPaying(true);
    setPayError(null);
    try {
      const order = await createReportOrder();
      const result = await openRazorpayCheckout(order, {
        name: 'Astro101',
        description: 'Unlock your Janma Kundali',
        contact: session?.phoneNumber ?? undefined,
      });
      await verifyReportPayment(result);
      setReport(null);
    } catch (err) {
      setPayError(err instanceof AppError ? err.message : 'Could not complete the payment.');
    } finally {
      setPaying(false);
    }
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

  if (report.status === 'locked') {
    return (
      <Screen>
        <HeaderRow />
        <LockedKundali
          priceLabel={`₹${price}`}
          paying={paying}
          error={payError}
          onPay={handleUnlock}
        />
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
        <AppText variant="displayMd" style={styles.title}>
          Your Janma Kundali
        </AppText>
        <AppText variant="body" color={colors.textSecondary} style={styles.subtitle}>
          Your chart data needs to be refreshed to display the full Vedic chart.
        </AppText>
        <Button label="Generate Chart" onPress={handleRegenerate} />
      </Screen>
    );
  }

  const moon = kundali.planets.find((p) => p.name === 'Moon');
  const sun = kundali.planets.find((p) => p.name === 'Sun');
  const lagnaSanskritName = ascendant
    ? (SANSKRIT_SIGNS[(ascendant.currentSign - 1) % 12] ?? '—')
    : '—';
  const moonSignName = moon ? (SIGN_NAMES[(moon.currentSign - 1) % 12] ?? '—') : '—';
  const moonSanskritName = moon ? (SANSKRIT_SIGNS[(moon.currentSign - 1) % 12] ?? '—') : '—';
  const sunSignName = sun ? (SIGN_NAMES[(sun.currentSign - 1) % 12] ?? '—') : '—';
  const sunSanskritName = sun ? (SANSKRIT_SIGNS[(sun.currentSign - 1) % 12] ?? '—') : '—';
  const nakshatra = moon
    ? (NAKSHATRA_NAMES[Math.floor(moon.fullDegree / (360 / 27)) % 27] ?? '—')
    : '—';
  const birthPlace = profile?.placeOfBirth ?? kundali.geo.completeName;
  const currentDasha = findCurrentDasha(kundali.mahaDasas);

  const lagnaSignIndex = ascendant ? ascendant.currentSign : null;
  const houses = lagnaSignIndex
    ? Array.from({ length: 12 }, (_, i) => {
        const houseNumber = i + 1;
        const signIndex = ((lagnaSignIndex - 1 + i) % 12) + 1;
        const planetsInHouse = kundali.planets
          .filter((p) => p.name !== 'Ascendant' && p.houseNumber === houseNumber)
          .map((p) => PLANET_ABBR[p.name] ?? p.name.slice(0, 2));
        return {
          houseNumber,
          signName: SANSKRIT_SIGNS[signIndex - 1],
          planets: planetsInHouse,
        };
      })
    : [];

  const highlights: string[] = [];
  if (lagnaSignIndex) {
    const lagnaLordName = SIGN_RULERS[SIGN_NAMES[(lagnaSignIndex - 1) % 12]];
    const lagnaLord = kundali.planets.find((p) => p.name === lagnaLordName);
    if (lagnaLord?.houseNumber) {
      highlights.push(
        `Ascendant lord (${lagnaLordName}) placed in house ${lagnaLord.houseNumber}, shaping how you are seen by others.`,
      );
    }

    const tenthSignIndex = ((lagnaSignIndex - 1 + 9) % 12) + 1;
    const tenthSignEnglish = SIGN_NAMES[tenthSignIndex - 1];
    highlights.push(
      `Career house (10th) in ${SANSKRIT_SIGNS[tenthSignIndex - 1]} (${tenthSignEnglish}) — ${CAREER_TRAITS[tenthSignEnglish]}`,
    );

    const seventhSignIndex = ((lagnaSignIndex - 1 + 6) % 12) + 1;
    const seventhSignEnglish = SIGN_NAMES[seventhSignIndex - 1];
    highlights.push(
      `Relationship house (7th) in ${SANSKRIT_SIGNS[seventhSignIndex - 1]} (${seventhSignEnglish}) — ${RELATIONSHIP_TRAITS[seventhSignEnglish]}`,
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <HeaderRow />

      {/* Title */}
      <AppText variant="displayMd" style={styles.title}>
        Your Janma Kundali
      </AppText>
      {kundali ? (
        <AppText variant="bodySmall" color={colors.textSecondary} style={styles.subtitle}>
          {kundali.geo.completeName}
        </AppText>
      ) : null}

      {/* Chart */}
      {kundali ? (
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <AppText variant="label" color={colors.primary}>
              Lagna: {lagnaSignName}
            </AppText>
            <AppText variant="bodySmall" color={colors.textMuted}>
              North Indian Chart
            </AppText>
          </View>
          <NorthIndianChart kundali={kundali} size={300} />
        </View>
      ) : null}

      {/* Chart Basics */}
      <InfoCard label="Chart Basics">
        <InfoRow label="Lagna" value={`${lagnaSanskritName} (${lagnaSignName})`} />
        <InfoRow label="Moon sign" value={`${moonSanskritName} (${moonSignName})`} />
        <InfoRow label="Sun sign" value={`${sunSanskritName} (${sunSignName})`} />
        <InfoRow label="Nakshatra" value={nakshatra} />
        <InfoRow
          label="Born"
          value={
            profile?.dateOfBirth && profile?.timeOfBirth
              ? `${profile.dateOfBirth} · ${profile.timeOfBirth}`
              : '—'
          }
        />
        <InfoRow label="Place" value={birthPlace} />
      </InfoCard>

      {/* Current Dasha */}
      <InfoCard label="Current Dasha">
        <AppText variant="body" color={colors.textPrimary}>
          {currentDasha ? `${currentDasha.lord} mahadasha` : 'Not available'}
        </AppText>
      </InfoCard>

      {/* House Placements */}
      {houses.length > 0 ? (
        <InfoCard label="House Placements">
          <View style={styles.houseGrid}>
            {houses.map((house) => (
              <View key={house.houseNumber} style={styles.houseCell}>
                <AppText variant="caption" color={colors.textMuted}>
                  H{house.houseNumber}
                </AppText>
                <AppText variant="bodySmall" color={colors.textPrimary} style={styles.houseSign}>
                  {house.signName}
                </AppText>
                <AppText variant="caption" color={colors.primary}>
                  {house.planets.length > 0 ? house.planets.join(' ') : '—'}
                </AppText>
              </View>
            ))}
          </View>
        </InfoCard>
      ) : null}

      {/* Highlights */}
      {highlights.length > 0 ? (
        <InfoCard label="Highlights">
          {highlights.map((text, i) => (
            <View key={i} style={styles.highlightRow}>
              <AppText variant="body" color={colors.primary}>
                •
              </AppText>
              <AppText variant="body" color={colors.textSecondary} style={styles.highlightText}>
                {text}
              </AppText>
            </View>
          ))}
        </InfoCard>
      ) : null}

      <View style={styles.footer}>
        <Pressable onPress={() => router.push('/(tabs)/astrologers')} style={styles.astroBtn}>
          <AppText variant="label" color={colors.primary}>
            Chat with an Astrologer →
          </AppText>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function InfoCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.infoCard}>
      <AppText variant="label" color={colors.primary} style={styles.infoCardLabel}>
        {label.toUpperCase()}
      </AppText>
      {children}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <AppText variant="body" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText variant="body" color={colors.textPrimary}>
        {value}
      </AppText>
    </View>
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
  scroll: { flex: 1, backgroundColor: colors.backgroundFrom },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
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
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  infoCardLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  houseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  houseCell: {
    width: '31%',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  houseSign: { fontWeight: '600' },
  highlightRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  highlightText: { flex: 1, lineHeight: 20 },
  footer: { alignItems: 'center', marginTop: spacing.md },
  astroBtn: {
    padding: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: spacing.xl,
  },
});
