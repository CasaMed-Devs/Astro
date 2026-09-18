import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Check, Crown, X } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { Screen } from '@/components/common/Screen';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { getMandate, getPricing, startTrialPayment } from '@/services/payment.service';
import { colors, radii, spacing } from '@/constants/theme';
import { AppError } from '@/utils/errors';
import type { MandateMethod } from '@/types/firestore';

const FEATURES = [
  '5 free credits the moment you set up auto-pay',
  '1 credit = 1 message, same price with every astrologer',
  'No time limits — chat as long as you have credits',
];

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

export default function PaywallScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [currency, setCurrency] = useState<string | undefined>(undefined);
  const [method, setMethod] = useState<MandateMethod>('upi');
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
    getPricing()
      .then((pricing) => {
        setAmount(pricing.trial.amount);
        setCurrency(pricing.trial.currency);
      })
      .catch(() => {
        setAmount(undefined);
        setCurrency(undefined);
      });
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
      const registration = await startTrialPayment(method);
      await Linking.openURL(registration.shortUrl);
      startPollingForConfirmation();
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Could not start the trial.');
    } finally {
      setProcessing(false);
    }
  };

  const pricingReady = amount != null && currency != null;

  // Closing without paying sends the user to the home screen, not "back" —
  // this screen is shown immediately after onboarding (no meaningful screen
  // to go back to) and a brand-new user has 0 credits, so home is the only
  // place they can actually be with nothing to do until they subscribe.
  const handleClose = () => router.replace('/(tabs)/home');

  return (
    <Screen scroll>
      <Pressable onPress={handleClose} style={styles.closeButton}>
        <X size={18} color={colors.textPrimary} />
      </Pressable>

      <View style={styles.header}>
        <View style={styles.badge}>
          <Crown size={16} color={colors.primary} />
          <AppText variant="label" color={colors.primary}>
            ASTRO101
          </AppText>
        </View>
        <AppText variant="displayMd">Try it for {currency === 'INR' ? '₹' : ''}1</AppText>
        <AppText variant="bodySmall" color={colors.textSecondary}>
          Set up auto-pay once, get 5 free credits instantly, and only ₹299 gets auto-debited
          starting the next day — cancel anytime.
        </AppText>
      </View>

      <View style={styles.features}>
        {FEATURES.map((feature) => (
          <View key={feature} style={styles.featureRow}>
            <Check size={16} color={colors.primary} />
            <AppText variant="label" color={colors.textSecondary} style={styles.featureText}>
              {feature}
            </AppText>
          </View>
        ))}
      </View>

      {pricingReady ? (
        <View style={styles.priceCard}>
          <View>
            <AppText variant="cardTitle">Pay now</AppText>
            <AppText variant="bodySmall" color={colors.textSecondary}>
              Then ₹299/month auto-debit from day 2
            </AppText>
          </View>
          <AppText variant="displayMd" color={colors.primaryDark}>
            {currency === 'INR' ? '₹' : ''}
            {amount}
          </AppText>
        </View>
      ) : (
        <View style={styles.priceCard}>
          <AppText variant="cardTitle">Pricing coming soon</AppText>
        </View>
      )}

      <View style={styles.methodRow}>
        <Pressable
          style={[styles.methodChip, method === 'upi' && styles.methodChipActive]}
          onPress={() => setMethod('upi')}
        >
          <AppText variant="label" color={method === 'upi' ? colors.onGradientText : colors.textPrimary}>
            UPI Autopay
          </AppText>
        </Pressable>
        <Pressable
          style={[styles.methodChip, method === 'card' && styles.methodChipActive]}
          onPress={() => setMethod('card')}
        >
          <AppText variant="label" color={method === 'card' ? colors.onGradientText : colors.textPrimary}>
            Card
          </AppText>
        </Pressable>
      </View>

      {error ? (
        <AppText variant="bodySmall" color={colors.danger} style={styles.error}>
          {error}
        </AppText>
      ) : null}

      {waitingForConfirmation ? (
        <AppText variant="bodySmall" color={colors.textSecondary} style={styles.error}>
          Waiting for payment confirmation... complete it in the browser tab that opened.
        </AppText>
      ) : null}

      <View style={styles.footer}>
        <Button
          label="Start trial"
          onPress={handleStartTrial}
          loading={processing || waitingForConfirmation}
          disabled={!pricingReady || !session}
        />
        <Pressable onPress={handleClose}>
          <AppText variant="body" color={colors.textSecondary} style={styles.skipLabel}>
            Not now
          </AppText>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  closeButton: {
    alignSelf: 'flex-end',
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  header: { gap: spacing.sm, marginTop: spacing.md },
  badge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  features: { gap: spacing.md, marginTop: spacing.xl },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  featureText: { flex: 1 },
  priceCard: {
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  methodRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  methodChip: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.sm,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  methodChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  error: { marginTop: spacing.md },
  footer: { marginTop: spacing.xl, marginBottom: spacing.xxl, gap: spacing.md },
  skipLabel: { textAlign: 'center' },
});
