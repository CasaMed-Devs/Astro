import { useEffect, useRef, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Sparkles, X } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { Screen } from '@/components/common/Screen';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { fetchAstrologerProfiles } from '@/services/astrologers.service';
import { getMandate, getPricing, startTrialPayment } from '@/services/payment.service';
import type { AstrologerProfile } from '@/features/astrologers/types';
import { colors, fonts, radii, shadows, spacing } from '@/constants/theme';
import { AppError } from '@/utils/errors';

// Registration defaults to UPI Autopay — India's most common recurring-
// payment method — rather than asking the user to choose upfront, per
// product decision. Razorpay's hosted registration page is still where the
// payment actually happens.
const REGISTRATION_METHOD = 'upi' as const;

const HERO_GRADIENT = ['#FFF3E0', '#FDE7C8'] as const;

const FEATURES = [
  '5 free credits the moment your trial starts',
  'Same 1-credit rate with every astrologer',
  'Credits top up automatically every month',
  'Cancel anytime, no questions asked',
];

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

export default function PaywallScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const [trialAmount, setTrialAmount] = useState<number | undefined>(undefined);
  const [trialCurrency, setTrialCurrency] = useState<string | undefined>(undefined);
  const [subscriptionAmount, setSubscriptionAmount] = useState<number | undefined>(undefined);
  const [avatarPersonas, setAvatarPersonas] = useState<AstrologerProfile[]>([]);
  const [processing, setProcessing] = useState(false);
  const [waitingForConfirmation, setWaitingForConfirmation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // A user who already set up their mandate has nothing to trial — send
  // them to the Rs.299 "add credits" screen instead.
  useEffect(() => {
    if (profile?.trialCreditsClaimed) {
      router.replace('/paywall/upgrade');
    }
  }, [profile?.trialCreditsClaimed]);

  useEffect(() => {
    fetchAstrologerProfiles()
      .then((profiles) => setAvatarPersonas(profiles.slice(0, 6)))
      .catch(() => setAvatarPersonas([]));
  }, []);

  useEffect(() => {
    getPricing()
      .then((pricing) => {
        setTrialAmount(pricing.trial.amount);
        setTrialCurrency(pricing.trial.currency);
        setSubscriptionAmount(pricing.subscription.amount);
      })
      .catch(() => {
        setTrialAmount(undefined);
        setTrialCurrency(undefined);
        setSubscriptionAmount(undefined);
      });
  }, []);

  // Refreshed here rather than by the screen that navigated us here (e.g.
  // right after saving birth details) — doing it there, while still inside
  // the onboarding stack, would flip hasBirthDetails to true and trigger
  // that stack's own auto-redirect to home at the same moment as our
  // navigation to this screen, racing over the native view tree.
  useEffect(() => {
    refreshProfile().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setWaitingForConfirmation(false);
  };

  const startPollingForConfirmation = () => {
    setWaitingForConfirmation(true);
    const startedAt = Date.now();

    pollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        stopPolling();
        setError('Still waiting for confirmation. If you completed the payment, check back shortly.');
        return;
      }
      try {
        const mandate = await getMandate();
        if (mandate.trialCreditsClaimed) {
          stopPolling();
          await refreshProfile();
          router.replace('/(tabs)/home');
        }
      } catch {
        // Transient — next tick retries.
      }
    }, POLL_INTERVAL_MS);
  };

  const handleStartTrial = async () => {
    setProcessing(true);
    setError(null);
    try {
      const registration = await startTrialPayment(REGISTRATION_METHOD);
      await Linking.openURL(registration.shortUrl);
      startPollingForConfirmation();
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Could not start the trial.');
    } finally {
      setProcessing(false);
    }
  };

  const pricingReady = trialAmount != null && trialCurrency != null;
  const currencySymbol = trialCurrency === 'INR' ? '₹' : '';

  // Closing without paying sends the user to the home screen, not "back" —
  // this screen is shown immediately after onboarding (no meaningful screen
  // to go back to) and a brand-new user has 0 credits, so home is the only
  // place they can actually be with nothing to do until they subscribe.
  const handleClose = () => router.replace('/(tabs)/home');

  return (
    <Screen scroll>
      <Pressable onPress={handleClose} style={styles.closeButton}>
        <X size={20} color={colors.textPrimary} />
      </Pressable>

      <LinearGradient
        colors={HERO_GRADIENT}
        style={styles.heroCard}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.heroGlyphRow}>
          <AppText style={styles.heroGlyph}>ॐ</AppText>
          <AppText style={styles.heroGlyphTitle}>जन्म कुंडली</AppText>
          <AppText style={styles.heroGlyph}>ॐ</AppText>
        </View>
        {avatarPersonas.length > 0 ? (
          <>
            <View style={styles.avatarStrip}>
              {avatarPersonas.map((persona) => (
                <Image key={persona.id} source={{ uri: persona.photoUrl }} style={styles.avatar} />
              ))}
            </View>
            <AppText style={styles.avatarCaption}>
              Kundali, tarot & palmistry experts ready to read your chart
            </AppText>
          </>
        ) : null}
      </LinearGradient>

      <View style={styles.header}>
        <View style={styles.badge}>
          <Sparkles size={16} color={colors.primary} />
          <AppText style={styles.badgeText}>ASTRO101 PLUS</AppText>
        </View>
        <AppText style={styles.headline}>
          Talk more, <AppText style={styles.headlineAccent}>pay less</AppText>
        </AppText>
        <AppText style={styles.subtext}>
          Start your trial and get 5 free credits instantly, then a flat monthly top-up keeps you
          talking.
        </AppText>
      </View>

      <View style={styles.features}>
        {FEATURES.map((feature) => (
          <View key={feature} style={styles.featureRow}>
            <View style={styles.featureIconWrap}>
              <Check size={16} color={colors.primary} strokeWidth={3} />
            </View>
            <AppText style={styles.featureText}>{feature}</AppText>
          </View>
        ))}
      </View>

      {pricingReady ? (
        <View style={styles.priceCard}>
          <View style={styles.priceAccentBar} />
          <View style={styles.priceCardBody}>
            <View style={styles.priceCardCopy}>
              <AppText style={styles.priceCardTitle}>Try it now</AppText>
              <AppText style={styles.priceCardSubtitle}>
                Then {currencySymbol}
                {subscriptionAmount ?? '—'}/month · Cancel anytime
              </AppText>
            </View>
            <AppText style={styles.priceValue}>
              {currencySymbol}
              {trialAmount}
            </AppText>
          </View>
        </View>
      ) : (
        <View style={styles.priceCard}>
          <View style={styles.priceCardBody}>
            <AppText style={styles.priceCardTitle}>Pricing coming soon</AppText>
          </View>
        </View>
      )}

      {error ? (
        <AppText variant="bodySmall" color={colors.danger} style={styles.error}>
          {error}
        </AppText>
      ) : null}

      {waitingForConfirmation ? (
        <AppText style={styles.waitingText}>
          Waiting for payment confirmation... complete it in the browser tab that opened.
        </AppText>
      ) : null}

      <View style={styles.footer}>
        <Button
          label={pricingReady ? `Start trial for ${currencySymbol}${trialAmount}` : 'Start trial'}
          onPress={handleStartTrial}
          loading={processing || waitingForConfirmation}
          disabled={!pricingReady || !session}
          style={styles.ctaButton}
        />
        <Pressable onPress={handleClose}>
          <AppText style={styles.skipLabel}>Continue without trial</AppText>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  closeButton: {
    alignSelf: 'flex-end',
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    ...shadows.card,
  },
  heroCard: {
    marginTop: spacing.md,
    borderRadius: radii.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    ...shadows.card,
  },
  heroGlyphRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  heroGlyph: { fontFamily: fonts.wordmark, fontSize: 26, color: colors.primary },
  heroGlyphTitle: { fontFamily: fonts.wordmark, fontSize: 26, color: colors.textPrimary },
  avatarStrip: { flexDirection: 'row' },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    marginLeft: -14,
    borderWidth: 3,
    borderColor: colors.surface,
  },
  avatarCaption: {
    marginTop: spacing.md,
    textAlign: 'center',
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
  },
  header: { gap: spacing.sm, marginTop: spacing.xxl },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  badgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    letterSpacing: 0.5,
    color: colors.primary,
  },
  headline: {
    fontFamily: fonts.display,
    fontSize: 38,
    lineHeight: 44,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  headlineAccent: {
    fontFamily: fonts.display,
    fontSize: 38,
    lineHeight: 44,
    color: colors.primary,
  },
  subtext: {
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 23,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  features: { gap: spacing.lg, marginTop: spacing.xxl },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  featureIconWrap: {
    width: 30,
    height: 30,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  priceCard: {
    marginTop: spacing.xxl,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    flexDirection: 'row',
    overflow: 'hidden',
    ...shadows.card,
  },
  priceAccentBar: { width: 6, backgroundColor: colors.primary },
  priceCardBody: {
    flex: 1,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  priceCardCopy: { flex: 1, gap: 2 },
  priceCardTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  priceCardSubtitle: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.textSecondary,
  },
  priceValue: {
    fontFamily: fonts.display,
    fontSize: 34,
    color: colors.primaryDark,
  },
  error: { marginTop: spacing.md, fontSize: 14 },
  waitingText: {
    marginTop: spacing.md,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.textSecondary,
  },
  footer: { marginTop: spacing.xxl, marginBottom: spacing.xxl, gap: spacing.md },
  ctaButton: { height: 56 },
  skipLabel: {
    textAlign: 'center',
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.textSecondary,
  },
});
