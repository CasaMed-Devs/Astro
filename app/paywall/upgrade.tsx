import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowRight, Check, FileText, MessageCircle, Sparkles, X } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { Screen } from '@/components/common/Screen';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { usePaywallData } from '@/services/paywallData';
import {
  getMandate,
  openRazorpaySubscriptionCheckout,
  startSubscriptionOrder,
  verifySubscriptionPayment,
} from '@/services/payment.service';
import { MetaEvents } from '@/services/analytics';
import { colors, fonts, radii, shadows, spacing } from '@/constants/theme';
import { AppError } from '@/utils/errors';

// Only used when the user has no auto-debit mandate yet (skipped the trial):
// the payment registers one at the subscription amount. UPI Autopay is the
// default, same as the trial paywall.
const REGISTRATION_METHOD = 'upi' as const;

// Same hero artwork as the trial paywall (app/paywall/index.tsx), cropped
// slightly shorter (390x300) so the whole screen fits without scrolling.
const HERO_ASPECT_RATIO = 390 / 300;

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

/**
 * Subscription screen. Always opens Razorpay Checkout — credits are added
 * only after the backend confirms a real, signature-verified payment. With an
 * active auto-debit mandate this restarts the 30-day cycle; without one, the
 * same payment also sets up auto-pay.
 */
export default function UpgradeScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const { pricing } = usePaywallData();
  const amount = pricing?.subscription.amount;
  const currency = pricing?.subscription.currency;
  const [processing, setProcessing] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Set once the subscription is created, read by finish()'s Purchase event —
  // needed there since the polling path reaches finish() without the
  // subscription object handleSubscribe created it from.
  const subscriptionIdRef = useRef<string | null>(null);

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
    setWaiting(false);
  };

  // Single success exit: refresh once, then swap to the success view (no
  // navigation here, so nothing can race the native view tree).
  const finish = async () => {
    stopPolling();
    if (amount != null && currency != null && subscriptionIdRef.current) {
      MetaEvents.logPurchase({
        amount,
        currency,
        plan: 'subscription',
        subscriptionId: subscriptionIdRef.current,
      });
    }
    await refreshProfile().catch(() => {});
    setSucceeded(true);
  };

  const startPollingForRegistration = () => {
    setWaiting(true);
    const startedAt = Date.now();

    pollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        stopPolling();
        setError('Still waiting for confirmation. If you completed the payment, check back shortly.');
        return;
      }
      try {
        const mandate = await getMandate();
        if (mandate.mandateStatus === 'active') await finish();
      } catch {
        // Transient — next tick retries.
      }
    }, POLL_INTERVAL_MS);
  };

  const handleSubscribe = async () => {
    setProcessing(true);
    setError(null);
    try {
      const subscription = await startSubscriptionOrder(REGISTRATION_METHOD);
      subscriptionIdRef.current = subscription.subscriptionId;
      if (amount != null && currency != null) {
        MetaEvents.logInitiatedCheckout({ plan: 'subscription', amount, currency });
      }
      const result = await openRazorpaySubscriptionCheckout(subscription, {
        name: 'Astro108',
        description: 'Astro108 Plus subscription',
        uid: session?.uid ?? '',
        contact: session?.phoneNumber ?? undefined,
        method: REGISTRATION_METHOD,
      });
      const verification = await verifySubscriptionPayment(result).catch(() => ({
        status: 'pending' as const,
      }));
      if (verification.status === 'ok') {
        await finish();
      } else {
        startPollingForRegistration();
      }
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Could not complete the payment.');
    } finally {
      setProcessing(false);
    }
  };

  // Closing without paying offers top-up instead — another way to keep chatting.
  const handleClose = () => router.replace('/wallet/topup');

  const pricingReady = amount != null && currency != null;
  const currencySymbol = currency === 'INR' ? '₹' : '';

  if (succeeded) {
    return (
      <Screen>
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Check size={32} color={colors.primary} strokeWidth={3} />
          </View>
          <AppText style={styles.successHeadline}>You&apos;re all set</AppText>
          <AppText style={styles.successBody}>
            Your subscription is active. New balance: {profile?.credits ?? '—'} credits.
          </AppText>
          <Button
            label="Done"
            onPress={() => router.replace('/(tabs)/home')}
            style={styles.ctaButton}
          />
        </View>
      </Screen>
    );
  }

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
          <AppText style={styles.headline}>Keep talking.</AppText>
          <AppText style={styles.headlineAccent}>Pay less.</AppText>
          <AppText style={styles.subtext}>
            Subscribe for a flat monthly amount and get your credits instantly.
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
            <AppText style={styles.pricingLabel}>Astro108 Plus</AppText>
            <AppText style={styles.priceValue}>
              {currencySymbol}
              {amount}
            </AppText>
            <AppText style={styles.pricingSubtitle}>Per month · Cancel anytime</AppText>
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

        {waiting ? <AppText style={styles.waitingText}>Confirming your payment...</AppText> : null}

        <Button
          label={pricingReady ? `Subscribe for ${currencySymbol}${amount}` : 'Subscribe'}
          icon={<ArrowRight size={18} color={colors.onGradientText} />}
          onPress={handleSubscribe}
          loading={processing || waiting}
          disabled={!pricingReady || !session}
          style={styles.ctaButton}
        />
        <Pressable onPress={handleClose}>
          <AppText style={styles.skipLabel}>Top up instead</AppText>
        </Pressable>
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
  pricingBlock: { alignItems: 'center', gap: 4 },
  pricingLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  priceValue: {
    fontFamily: fonts.display,
    fontSize: 52,
    lineHeight: 60,
    color: colors.primaryDark,
  },
  pricingSubtitle: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.textSecondary,
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
  ctaButton: { height: 56, alignSelf: 'stretch' },
  skipLabel: {
    textAlign: 'center',
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.textSecondary,
  },
  successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successHeadline: {
    fontFamily: fonts.display,
    fontSize: 38,
    lineHeight: 44,
    color: colors.textPrimary,
  },
  successBody: {
    textAlign: 'center',
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 23,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
});
