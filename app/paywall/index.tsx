import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowRight, FileText, MessageCircle, Sparkles, X } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { Screen } from '@/components/common/Screen';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { usePaywallData } from '@/services/paywallData';
import {
  getMandate,
  openRazorpaySubscriptionCheckout,
  startTrialOrder,
  verifyTrialPayment,
} from '@/services/payment.service';
import { MetaEvents } from '@/services/analytics';
import { colors, fonts, radii, shadows, spacing } from '@/constants/theme';
import { AppError } from '@/utils/errors';
import type { LegalDocId } from '@/constants/legal';

const openLegalDoc = (doc: LegalDocId) =>
  router.push({ pathname: '/legal/[doc]', params: { doc } });

// Registration defaults to UPI Autopay — India's most common recurring-
// payment method — rather than asking the user to choose upfront, per
// product decision. Razorpay's hosted registration page is still where the
// payment actually happens.
const REGISTRATION_METHOD = 'upi' as const;

// Source: 390x361 hero artwork (astrologer + zodiac wheel + example-question
// chips), exported from Figma, cropped slightly shorter (390x300) here so the
// whole screen fits without scrolling. Badge/headline/subtext are rendered
// natively on top of it (see heroTextOverlay) so they stay dynamic.
const HERO_ASPECT_RATIO = 390 / 361; // must match hero.png dimensions

const FEATURES = [
  {
    icon: MessageCircle,
    title: 'Talk to any astrologer',
    description: 'Choose from top astrologers in Kundali, Tarot, Palmistry, Numerology and Vastu.',
  },
  {
    icon: Sparkles,
    title: 'Ask all your questions',
    description: 'Get personalised answers on love, career, money, health and more.',
  },
  {
    icon: FileText,
    title: 'Kundali report & daily horoscope',
    description: 'Get your detailed Kundali report and daily horoscope included.',
  },
];

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

export default function PaywallScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const { pricing } = usePaywallData();
  const trialAmount = pricing?.trial.amount;
  const trialCurrency = pricing?.trial.currency;
  const trialDurationDays = pricing?.trialDurationDays ?? 1;
  const subscriptionAmount = pricing?.subscription.amount;
  const [processing, setProcessing] = useState(false);
  const [waitingForConfirmation, setWaitingForConfirmation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Set once the trial subscription is created, read by finishTrial's
  // Purchase event — needed there since the polling path reaches finishTrial
  // without the subscription object handleStartTrial created it from.
  const subscriptionIdRef = useRef<string | null>(null);

  // A user who already set up their mandate has nothing to trial — send
  // them to the Rs.299 "add credits" screen instead.
  // Skipped while we're finishing our own trial payment (see finishTrial):
  // refreshProfile() flips trialCreditsClaimed, and redirecting here as well
  // as to home would run two router.replace calls at once — the racing
  // native view mounts crash Fabric ("addViewAt: child already has a parent").
  const finishingRef = useRef(false);
  useEffect(() => {
    if (profile?.trialCreditsClaimed && !finishingRef.current) {
      router.replace('/paywall/upgrade');
    }
  }, [profile?.trialCreditsClaimed]);

  // Single exit after a successful trial: refresh, then navigate exactly once.
  const finishTrial = async () => {
    finishingRef.current = true;
    stopPolling();
    if (trialAmount != null && trialCurrency != null && subscriptionIdRef.current) {
      MetaEvents.logPurchase({
        amount: trialAmount,
        currency: trialCurrency,
        plan: 'trial',
        subscriptionId: subscriptionIdRef.current,
      });
    }
    await refreshProfile().catch(() => {});
    router.replace('/(tabs)/home');
  };

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
        if (mandate.trialCreditsClaimed && !finishingRef.current) {
          await finishTrial();
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
      const subscription = await startTrialOrder(REGISTRATION_METHOD);
      subscriptionIdRef.current = subscription.subscriptionId;
      if (trialAmount != null && trialCurrency != null) {
        MetaEvents.logInitiatedCheckout({ plan: 'trial', amount: trialAmount, currency: trialCurrency });
      }
      const result = await openRazorpaySubscriptionCheckout(subscription, {
        name: 'Astro108',
        description: 'Start your trial',
        uid: session?.uid ?? '',
        contact: session?.phoneNumber ?? undefined,
      });
      // Ask the backend to confirm right away (signature-checked); if
      // Razorpay hasn't issued the mandate token yet, fall back to polling
      // until its webhook completes the registration.
      const verification = await verifyTrialPayment(result).catch(() => ({ status: 'pending' as const }));
      if (verification.status === 'ok') {
        await finishTrial();
      } else {
        startPollingForConfirmation();
      }
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
    <Screen padded={false}>
      <View style={styles.heroWrap}>
        <Image
          source={require('../../assets/images/paywall/hero.png')}
          style={styles.heroImage}
          resizeMode="cover"
        />
        <Pressable onPress={handleClose} style={styles.closeButton} hitSlop={8}>
          <X size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.heroTextOverlay}>
          <View style={styles.badge}>
            <Sparkles size={16} color={colors.primary} />
            <AppText style={styles.badgeText}>ASTRO108 PLUS</AppText>
          </View>
          <AppText style={styles.headline}>Your Questions.</AppText>
          <AppText style={styles.headlineAccent}>Real guidance.</AppText>
          <AppText style={styles.subtext}>
            Talk to expert astrologers and get clarity on love, career, money, health and more.
          </AppText>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.featuresCard}>
          {FEATURES.map((feature, index) => (
            <View key={feature.title}>
              <View style={styles.featureRow}>
                <View style={styles.featureIconWrap}>
                  <feature.icon size={20} color={colors.primary} />
                </View>
                <View style={styles.featureCopy}>
                  <AppText style={styles.featureTitle}>{feature.title}</AppText>
                  <AppText style={styles.featureDescription}>{feature.description}</AppText>
                </View>
              </View>
              {index < FEATURES.length - 1 ? <View style={styles.featureDivider} /> : null}
            </View>
          ))}
        </View>

        {pricingReady ? (
          <View style={styles.pricingBlock}>
            <AppText style={styles.pricingLabel}>
              Try for {trialDurationDays} day{trialDurationDays === 1 ? '' : 's'} at only
            </AppText>
            <AppText style={styles.priceValue}>
              {currencySymbol}
              {trialAmount}
            </AppText>
            <AppText style={styles.pricingSubtitle}>
              Then auto renews at {currencySymbol}
              {subscriptionAmount ?? '—'}/month · Cancel anytime
            </AppText>
          </View>
        ) : (
          <View style={styles.pricingBlock}>
            <View style={styles.priceSkeleton} />
          </View>
        )}

        {error ? (
          <AppText variant="bodySmall" color={colors.danger} style={styles.error}>
            {error}
          </AppText>
        ) : null}

        {waitingForConfirmation ? (
          <AppText style={styles.waitingText}>Confirming your payment...</AppText>
        ) : null}

        <Button
          label={pricingReady ? `Start your trial for ${currencySymbol}${trialAmount}` : 'Start trial'}
          icon={<ArrowRight size={18} color={colors.onGradientText} />}
          onPress={handleStartTrial}
          loading={processing || waitingForConfirmation}
          disabled={!pricingReady || !session}
          style={styles.ctaButton}
        />

        <AppText style={styles.termsText}>
          By continuing you agree to our{' '}
          <AppText style={styles.termsLink} onPress={() => openLegalDoc('terms')}>
            Terms
          </AppText>{' '}
          and{' '}
          <AppText style={styles.termsLink} onPress={() => openLegalDoc('privacy')}>
            Privacy Policy
          </AppText>
          .
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroWrap: { width: '100%', aspectRatio: HERO_ASPECT_RATIO },
  heroImage: { width: '100%', height: '100%' },
  closeButton: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  heroTextOverlay: {
    position: 'absolute',
    top: '20%',
    right: spacing.lg,
    left: '52%',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    ...shadows.card,
  },
  badgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 0.5,
    color: colors.primary,
  },
  headline: {
    fontFamily: fonts.display,
    fontSize: 24,
    lineHeight: 28,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  headlineAccent: {
    fontFamily: fonts.display,
    fontSize: 24,
    lineHeight: 28,
    color: colors.primary,
  },
  subtext: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  body: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: 'space-evenly' },
  featuresCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  featureIconWrap: {
    width: 42,
    height: 42,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureCopy: { flex: 1, gap: 2 },
  featureTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  featureDescription: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  featureDivider: { height: 1, backgroundColor: colors.border },
  pricingBlock: { alignItems: 'center', gap: 5 },
  pricingLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    color: colors.textPrimary,
    paddingBottom:1
  },
  priceValue: {
    fontFamily: fonts.display,
    fontSize: 50,
    lineHeight: 60,
    color: colors.primaryDark,
  },
  pricingSubtitle: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  priceSkeleton: { height: 90, width: '100%', borderRadius: radii.sm, backgroundColor: colors.surfaceAlt },
  error: { marginTop: spacing.sm, fontSize: 14, textAlign: 'center' },
  waitingText: {
    marginTop: spacing.sm,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  ctaButton: { height: 56 },
  termsText: {
    textAlign: 'center',
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.textSecondary,
  },
  termsLink: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.textSecondary,
  },
});
