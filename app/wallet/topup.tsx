import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, Wallet, X } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { Card } from '@/components/cards/Card';
import { Input } from '@/components/forms/Input';
import { Screen } from '@/components/common/Screen';
import { useAuth } from '@/features/auth/context/AuthProvider';
import {
  createTopUpOrder,
  getPricing,
  getTopUpConfig,
  getTopUpHistory,
  openRazorpayCheckout,
  reconcilePayments,
  verifyTopUpPayment,
  type PublicPricing,
  type TopUpConfig,
  type TopUpHistoryItem,
} from '@/services/payment.service';
import { colors, fonts, radii, spacing } from '@/constants/theme';
import { AppError } from '@/utils/errors';

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/astrologers'));

export default function TopUpScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const [config, setConfig] = useState<TopUpConfig | null>(null);
  const [pricing, setPricing] = useState<PublicPricing | null>(null);
  const [history, setHistory] = useState<TopUpHistoryItem[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null); // rupees
  const [customAmount, setCustomAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCredits, setSuccessCredits] = useState<number | null>(null);

  const loadHistory = useCallback(() => {
    setHistoryError(false);
    getTopUpHistory()
      .then(setHistory)
      .catch(() => {
        setHistory((prev) => prev ?? []);
        setHistoryError(true);
      });
  }, []);

  useEffect(() => {
    getTopUpConfig()
      .then(setConfig)
      .catch(() => setError('Could not load top-up options. Please try again.'));
    getPricing()
      .then(setPricing)
      .catch(() => undefined);
    loadHistory();
  }, [loadHistory]);

  const minRupees = config ? config.minAmount : null;
  const maxRupees = config ? config.maxAmount : null;
  const currencySymbol = !config || config.currency === 'INR' ? '₹' : '';
  const amountRupees = selectedAmount ?? (customAmount ? Number(customAmount) : null);
  const amountValid =
    amountRupees != null &&
    minRupees != null &&
    maxRupees != null &&
    amountRupees >= minRupees &&
    amountRupees <= maxRupees;

  const rupeesPerCredit = config?.rupeesPerCredit ?? pricing?.rupeesPerCredit ?? 1;
  const balanceRupees = profile ? Math.round(profile.credits * rupeesPerCredit) : null;
  const reportAmount = pricing?.report.amount;

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
    if (!amountValid || !amountRupees) {
      if (config && amountRupees != null) {
        setError(`Enter an amount between ${currencySymbol}${minRupees} and ${currencySymbol}${maxRupees}.`);
      }
      return;
    }
    setProcessing(true);
    setError(null);
    let paid = false;
    try {
      const order = await createTopUpOrder(amountRupees);
      const result = await openRazorpayCheckout(order, {
        name: 'Astro101 wallet top-up',
        description: `Add ${amountRupees} credits`,
        uid: session?.uid ?? '',
        contact: session?.phoneNumber ?? undefined,
      });
      paid = true;
      const verification = await verifyTopUpPayment(result);
      setSuccessCredits(verification.creditsAwarded);
      setSelectedAmount(null);
      setCustomAmount('');
      await refreshProfile();
      loadHistory();
    } catch (err) {
      if (paid) {
        // Money was taken but our verify call failed — let the backend check
        // with Razorpay and credit it instead of leaving the user unpaid.
        try {
          const recovery = await reconcilePayments();
          if (recovery.resolved.length > 0) {
            await refreshProfile();
            loadHistory();
            setError('Payment received. Your credits have been added.');
            return;
          }
        } catch {
          // fall through to the generic message below
        }
        setError('Payment received. Credits may take a moment to appear — reopen the app if they do not.');
        return;
      }
      setError(err instanceof AppError ? err.message : 'Could not complete the top-up.');
    } finally {
      setProcessing(false);
    }
  };

  if (successCredits != null) {
    return (
      <Screen>
        <Pressable onPress={goBack} style={styles.closeButton}>
          <X size={18} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.successContainer}>
          <AppText variant="displayMd">Top-up successful</AppText>
          <AppText variant="body" color={colors.textSecondary} style={styles.successBody}>
            {successCredits} credits added. New balance: {profile?.credits ?? '—'} credits.
          </AppText>
          <Button label="Done" onPress={goBack} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Pressable onPress={goBack} style={styles.backRow} hitSlop={8}>
        <ArrowLeft size={18} color={colors.textSecondary} />
        <AppText variant="body" color={colors.textSecondary}>
          Astrologers
        </AppText>
      </Pressable>

      <Card style={styles.balanceCard}>
        <View style={styles.balanceLabelRow}>
          <Wallet size={16} color={colors.primary} />
          <AppText variant="bodySmall" color={colors.textSecondary} style={styles.balanceLabel}>
            WALLET BALANCE
          </AppText>
        </View>
        <AppText variant="displayLg" color={colors.primary}>
          {balanceRupees != null ? `${currencySymbol}${balanceRupees}` : '—'}
        </AppText>
        <AppText variant="bodySmall" color={colors.textSecondary}>
          {reportAmount
            ? `Used for per-minute chats and the ${currencySymbol}${reportAmount} kundali unlock.`
            : 'Used for chats with astrologers. Cannot be withdrawn or transferred.'}
        </AppText>
      </Card>

      <AppText variant="displayMd" style={styles.sectionTitle}>
        Recharge
      </AppText>

      {config ? (
        <>
          <View style={styles.presetGrid}>
            {config.presetAmounts.map((rupees) => {
              const active = selectedAmount === rupees;
              return (
                <Pressable
                  key={rupees}
                  onPress={() => handleSelectPreset(rupees)}
                  style={[styles.presetTile, active && styles.presetTileActive]}
                >
                  <AppText variant="cardTitle" color={colors.primary}>
                    {currencySymbol}
                    {rupees}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.customRow}>
            <Input
              value={customAmount}
              onChangeText={handleCustomAmountChange}
              placeholder="Other amount"
              keyboardType="number-pad"
              containerStyle={styles.customInput}
            />
            <Button
              label="Add"
              onPress={handlePay}
              loading={processing}
              disabled={!amountValid}
              style={styles.addButton}
            />
          </View>
          <AppText variant="caption" color={colors.textMuted} style={styles.hint}>
            Min {currencySymbol}
            {minRupees} · Max {currencySymbol}
            {maxRupees}
          </AppText>

          {error ? (
            <AppText variant="bodySmall" color={colors.danger} style={styles.error}>
              {error}
            </AppText>
          ) : null}
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

      <AppText variant="label" color={colors.primary} style={styles.activityTitle}>
        RECENT ACTIVITY
      </AppText>
      {history == null ? (
        <AppText variant="bodySmall" color={colors.textSecondary}>
          Loading...
        </AppText>
      ) : history.length === 0 ? (
        <AppText variant="bodySmall" color={colors.textSecondary}>
          {historyError ? 'Could not load activity.' : 'No recharges yet.'}
        </AppText>
      ) : (
        <View style={styles.activityList}>
          {history.map((item) => (
            <View key={item.id} style={styles.activityRow}>
              <View style={styles.activityText}>
                <AppText variant="cardTitle">Wallet recharge</AppText>
                <AppText variant="bodySmall" color={colors.textSecondary}>
                  {formatDateTime(item.createdAt)}
                </AppText>
              </View>
              <AppText variant="cardTitle" color={colors.primary}>
                +{currencySymbol}
                {item.amount}
              </AppText>
            </View>
          ))}
        </View>
      )}
      <View style={styles.bottomSpace} />
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
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  balanceCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  balanceLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  balanceLabel: { letterSpacing: 1.5 },
  sectionTitle: { marginTop: spacing.xl, marginBottom: spacing.md, fontFamily: fonts.display },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  presetTile: {
    width: '47.5%',
    flexGrow: 1,
    height: 62,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetTileActive: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceAlt,
  },
  customRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  customInput: { flex: 1 },
  addButton: { width: 96 },
  hint: { marginTop: spacing.xs },
  error: { marginTop: spacing.md },
  activityTitle: { marginTop: spacing.xl, marginBottom: spacing.md, letterSpacing: 1 },
  activityList: { gap: spacing.md },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  activityText: { gap: 2 },
  bottomSpace: { height: spacing.xxl },
  successContainer: { flex: 1, justifyContent: 'center', gap: spacing.md, alignItems: 'center' },
  successBody: { textAlign: 'center' },
});
