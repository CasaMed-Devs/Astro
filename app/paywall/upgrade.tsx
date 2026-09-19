import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Sparkles, X } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { Screen } from '@/components/common/Screen';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { fetchAstrologerProfiles } from '@/services/astrologers.service';
import {
  getMandate,
  getPricing,
  openRazorpayCheckout,
  startSubscriptionOrder,
  verifySubscriptionPayment,
} from '@/services/payment.service';
import type { AstrologerProfile } from '@/features/astrologers/types';
import { colors, fonts, radii, shadows, spacing } from '@/constants/theme';
import { AppError } from '@/utils/errors';

// Only used when the user has no auto-debit mandate yet (skipped the trial):
// the payment registers one at the subscription amount. UPI Autopay is the
// default, same as the trial paywall.
const REGISTRATION_METHOD = 'upi' as const;

const HERO_GRADIENT = ['#FFF3E0', '#FDE7C8'] as const;

const FEATURES = [
  'Credits are added the moment your payment succeeds',
  'Same 1-credit rate with every astrologer',
  'Credits top up automatically every month',
  'Cancel anytime, no questions asked',
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
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [currency, setCurrency] = useState<string | undefined>(undefined);
  const [avatarPersonas, setAvatarPersonas] = useState<AstrologerProfile[]>([]);
  const [processing, setProcessing] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getPricing()
      .then((pricing) => {
        setAmount(pricing.subscription.amount);
        setCurrency(pricing.subscription.currency);
      })
      .catch(() => {
        setAmount(undefined);
        setCurrency(undefined);
      });
    fetchAstrologerProfiles()
      .then((profiles) => setAvatarPersonas(profiles.slice(0, 6)))
      .catch(() => setAvatarPersonas([]));
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
    setWaiting(false);
  };

  // Single success exit: refresh once, then swap to the success view (no
  // navigation here, so nothing can race the native view tree).
  const finish = async () => {
    stopPolling();
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
      const order = await startSubscriptionOrder(REGISTRATION_METHOD);
      const result = await openRazorpayCheckout(order, {
        name: 'Astro101',
        description: 'Astro101 Plus subscription',
        contact: session?.phoneNumber ?? undefined,
        customerId: order.customerId,
        method: order.customerId ? REGISTRATION_METHOD : undefined,
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
          <AppText style={styles.headline}>You&apos;re all set</AppText>
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
          Keep talking, <AppText style={styles.headlineAccent}>pay less</AppText>
        </AppText>
        <AppText style={styles.subtext}>
          Subscribe for a flat monthly amount and get your credits instantly, so the conversation
          never stops.
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

      <View style={styles.priceCard}>
        <View style={styles.priceAccentBar} />
        <View style={styles.priceCardBody}>
          {pricingReady ? (
            <>
              <View style={styles.priceCardCopy}>
                <AppText style={styles.priceCardTitle}>Astro101 Plus</AppText>
                <AppText style={styles.priceCardSubtitle}>Per month · Cancel anytime</AppText>
              </View>
              <AppText style={styles.priceValue}>
                {currencySymbol}
                {amount}
              </AppText>
            </>
          ) : (
            <AppText style={styles.priceCardTitle}>Loading...</AppText>
          )}
        </View>
      </View>

      {error ? (
        <AppText variant="bodySmall" color={colors.danger} style={styles.error}>
          {error}
        </AppText>
      ) : null}

      {waiting ? <AppText style={styles.waitingText}>Confirming your payment...</AppText> : null}

      <View style={styles.footer}>
        <Button
          label={pricingReady ? `Subscribe for ${currencySymbol}${amount}` : 'Subscribe'}
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
  successBody: {
    textAlign: 'center',
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 23,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
});
