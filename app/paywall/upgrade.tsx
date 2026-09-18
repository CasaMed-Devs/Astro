import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Crown, X } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { Screen } from '@/components/common/Screen';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { getMandate, getPricing, upgradeNow } from '@/services/payment.service';
import { colors, radii, spacing } from '@/constants/theme';
import { AppError } from '@/utils/errors';
import type { MandateMethod } from '@/types/firestore';

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * "Add credits" / early-upgrade screen. If the user already has an active
 * auto-debit mandate (the normal case, after the Rs.1 trial), this charges
 * Rs.299 immediately and restarts the 30-day cycle — cancelling whatever
 * day-2/monthly charge was pending. If they somehow have no mandate at all
 * (skipped the trial), this registers one directly at the subscription
 * amount instead.
 */
export default function UpgradeScreen() {
  const { profile, refreshProfile } = useAuth();
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [currency, setCurrency] = useState<string | undefined>(undefined);
  const [hasMandate, setHasMandate] = useState<boolean | null>(null);
  const [method, setMethod] = useState<MandateMethod>('upi');
  const [processing, setProcessing] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCredits, setSuccessCredits] = useState<number | null>(null);
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
    getMandate()
      .then((mandate) => setHasMandate(mandate.mandateStatus === 'active'))
      .catch(() => setHasMandate(false));
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
        if (mandate.mandateStatus === 'active') {
          stopPolling();
          await refreshProfile();
          router.back();
        }
      } catch {
        // Transient — next tick retries.
      }
    }, POLL_INTERVAL_MS);
  };

  const handleSubscribe = async () => {
    setProcessing(true);
    setError(null);
    try {
      const result = await upgradeNow(hasMandate ? undefined : method);
      if (result.status === 'charged') {
        setSuccessCredits(result.creditsAwarded ?? 0);
        await refreshProfile();
      } else if (result.shortUrl) {
        await Linking.openURL(result.shortUrl);
        startPollingForRegistration();
      }
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Could not complete the payment.');
    } finally {
      setProcessing(false);
    }
  };

  // Closing this screen without paying routes to top-up instead, per the
  // product decision — an alternative way to keep chatting right now.
  const handleClose = () => router.replace('/wallet/topup');

  if (successCredits != null) {
    return (
      <Screen>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <X size={18} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.successContainer}>
          <AppText variant="displayMd">You&apos;re all set</AppText>
          <AppText variant="body" color={colors.textSecondary} style={styles.successBody}>
            {successCredits} credits added. New balance: {profile?.credits ?? '—'} credits.
          </AppText>
          <Button label="Done" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const pricingReady = amount != null && currency != null && hasMandate !== null;

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
        <AppText variant="displayMd">Add {currency === 'INR' ? '₹' : ''}299 worth of credits</AppText>
        <AppText variant="bodySmall" color={colors.textSecondary}>
          {hasMandate
            ? 'This restarts your 30-day auto-debit cycle from today.'
            : 'Set up auto-pay to charge this now and every 30 days after.'}
        </AppText>
      </View>

      {pricingReady ? (
        <View style={styles.priceCard}>
          <AppText variant="cardTitle">Pay now</AppText>
          <AppText variant="displayMd" color={colors.primaryDark}>
            {currency === 'INR' ? '₹' : ''}
            {amount}
          </AppText>
        </View>
      ) : (
        <View style={styles.priceCard}>
          <AppText variant="cardTitle">Loading...</AppText>
        </View>
      )}

      {pricingReady && !hasMandate ? (
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
      ) : null}

      {error ? (
        <AppText variant="bodySmall" color={colors.danger} style={styles.error}>
          {error}
        </AppText>
      ) : null}

      {waiting ? (
        <AppText variant="bodySmall" color={colors.textSecondary} style={styles.error}>
          Waiting for payment confirmation... complete it in the browser tab that opened.
        </AppText>
      ) : null}

      <View style={styles.footer}>
        <Button
          label={hasMandate ? 'Subscribe now' : 'Set up auto-pay & subscribe'}
          onPress={handleSubscribe}
          loading={processing || waiting}
          disabled={!pricingReady}
        />
        <Pressable onPress={handleClose}>
          <AppText variant="body" color={colors.textSecondary} style={styles.skipLabel}>
            Top up instead
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
  successContainer: { flex: 1, justifyContent: 'center', gap: spacing.md, alignItems: 'center' },
  successBody: { textAlign: 'center' },
});
