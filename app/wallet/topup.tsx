import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { X } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { Input } from '@/components/forms/Input';
import { Screen } from '@/components/common/Screen';
import { useAuth } from '@/features/auth/context/AuthProvider';
import {
  createTopUpOrder,
  getTopUpConfig,
  openRazorpayCheckout,
  verifyTopUpPayment,
  type TopUpConfig,
} from '@/services/payment.service';
import { colors, radii, spacing } from '@/constants/theme';
import { AppError } from '@/utils/errors';

export default function TopUpScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const [config, setConfig] = useState<TopUpConfig | null>(null);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null); // rupees
  const [customAmount, setCustomAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCredits, setSuccessCredits] = useState<number | null>(null);

  useEffect(() => {
    getTopUpConfig()
      .then(setConfig)
      .catch(() => setError('Could not load top-up options. Please try again.'));
  }, []);

  const minRupees = config ? config.minAmount : null;
  const maxRupees = config ? config.maxAmount : null;
  const amountRupees = selectedAmount ?? (customAmount ? Number(customAmount) : null);
  const amountValid =
    amountRupees != null &&
    minRupees != null &&
    maxRupees != null &&
    amountRupees >= minRupees &&
    amountRupees <= maxRupees;

  const handleSelectPreset = (rupees: number) => {
    setSelectedAmount(rupees);
    setCustomAmount('');
    setError(null);
  };

  const handleCustomAmountChange = (value: string) => {
    setCustomAmount(value.replace(/[^0-9]/g, ''));
    setSelectedAmount(null);
    setError(null);
  };

  const handlePay = async () => {
    if (!amountValid || !amountRupees) return;
    setProcessing(true);
    setError(null);
    try {
      const order = await createTopUpOrder(amountRupees);
      const result = await openRazorpayCheckout(order, {
        name: 'Astro101 wallet top-up',
        description: `Add ${amountRupees} credits`,
        contact: session?.phoneNumber ?? undefined,
      });
      const verification = await verifyTopUpPayment(result);
      setSuccessCredits(verification.creditsAwarded);
      await refreshProfile();
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Could not complete the top-up.');
    } finally {
      setProcessing(false);
    }
  };

  if (successCredits != null) {
    return (
      <Screen>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <X size={18} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.successContainer}>
          <AppText variant="displayMd">Top-up successful</AppText>
          <AppText variant="body" color={colors.textSecondary} style={styles.successBody}>
            {successCredits} credits added. New balance: {profile?.credits ?? '—'} credits.
          </AppText>
          <Button label="Done" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Pressable onPress={() => router.back()} style={styles.closeButton}>
        <X size={18} color={colors.textPrimary} />
      </Pressable>

      <View style={styles.header}>
        <AppText variant="displayMd">Top up wallet</AppText>
        <AppText variant="bodySmall" color={colors.textSecondary}>
          Add money to your wallet to keep chatting with astrologers. Balance is used only inside
          Astro101 and cannot be withdrawn or transferred.
        </AppText>
        {profile ? (
          <AppText variant="body" color={colors.primaryDark} style={styles.currentBalance}>
            Current balance: {profile.credits} credits
          </AppText>
        ) : null}
      </View>

      {config ? (
        <>
          <View style={styles.presetGrid}>
            {config.presetAmounts.map((rupees) => {
              const active = selectedAmount === rupees;
              return (
                <Pressable
                  key={rupees}
                  onPress={() => handleSelectPreset(rupees)}
                  style={[styles.presetChip, active && styles.presetChipActive]}
                >
                  <AppText
                    variant="label"
                    color={active ? colors.onGradientText : colors.textPrimary}
                  >
                    {config.currency === 'INR' ? '₹' : ''}
                    {rupees}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <AppText variant="label" color={colors.textSecondary} style={styles.customLabel}>
            Or enter a custom amount ({config.currency === 'INR' ? '₹' : ''}
            {minRupees}–{maxRupees})
          </AppText>
          <Input
            value={customAmount}
            onChangeText={handleCustomAmountChange}
            placeholder={`Amount in ${config.currency}`}
            keyboardType="number-pad"
          />

          {error ? (
            <AppText variant="bodySmall" color={colors.danger} style={styles.error}>
              {error}
            </AppText>
          ) : null}

          <View style={styles.footer}>
            <Button
              label={amountRupees ? `Pay ${config.currency === 'INR' ? '₹' : ''}${amountRupees}` : 'Pay'}
              onPress={handlePay}
              loading={processing}
              disabled={!amountValid}
            />
          </View>
        </>
      ) : error ? (
        <AppText variant="bodySmall" color={colors.danger} style={styles.error}>
          {error}
        </AppText>
      ) : (
        <AppText variant="body" color={colors.textSecondary} style={styles.error}>
          Loading top-up options...
        </AppText>
      )}
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
  header: { gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.xl },
  currentBalance: { marginTop: spacing.sm },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  presetChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  customLabel: { marginBottom: spacing.sm },
  error: { marginTop: spacing.md },
  footer: { marginTop: spacing.xl, marginBottom: spacing.xxl },
  successContainer: { flex: 1, justifyContent: 'center', gap: spacing.md, alignItems: 'center' },
  successBody: { textAlign: 'center' },
});
