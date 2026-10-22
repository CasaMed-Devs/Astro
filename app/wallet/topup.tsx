import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  Coins,
  Lock,
  Wallet,
  X,
  Zap,
} from 'lucide-react-native';

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
import { colors, fonts, gradients, radii, shadows, spacing } from '@/constants/theme';
import { AppError } from '@/utils/errors';
import { getPaywallRoute, hasAccess } from '@/utils/paywall';

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Must mirror the backend's top-up credit formula exactly
// (functions/src/services/credits.service.ts creditWallet, called with
// creditsPerRupee = 1 / rupeesPerCredit) so the preview equals what's credited.
function creditsFor(rupees: number, rupeesPerCredit: number): number {
  return Math.floor(rupees * (1 / rupeesPerCredit));
}

const trimNumber = (n: number) => Number(n.toFixed(2));

/** "₹1 = 2 credits" when a rupee buys at least one credit, else "₹2 = 1 credit". */
function formatRate(rupeesPerCredit: number, currencySymbol: string): string {
  const creditsPerRupee = 1 / rupeesPerCredit;
  if (creditsPerRupee >= 1) {
    const credits = trimNumber(creditsPerRupee);
    return `${currencySymbol}1 = ${credits} ${credits === 1 ? 'credit' : 'credits'}`;
  }
  return `${currencySymbol}${trimNumber(rupeesPerCredit)} = 1 credit`;
}

const formatCredits = (n: number) => n.toLocaleString('en-IN');

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

  // Trial and paid subscribers (until their paid period ends) only.
  const canTopUp = hasAccess(profile);

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

  // Admin-set rate; null until loaded so we never show a made-up rate.
  const rawRate = config?.rupeesPerCredit ?? pricing?.rupeesPerCredit;
  const rupeesPerCredit = rawRate && rawRate > 0 ? rawRate : null;
  const creditsPreview =
    amountRupees != null && rupeesPerCredit != null ? creditsFor(amountRupees, rupeesPerCredit) : null;
  const largestPreset = config && config.presetAmounts.length > 1 ? Math.max(...config.presetAmounts) : null;
  const customOutOfRange = customAmount !== '' && !amountValid && config != null;
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
    if (!canTopUp) {
      router.push(getPaywallRoute(profile));
      return;
    }
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
        name: 'Astro108 wallet top-up',
        description:
          creditsPreview != null
            ? `Add ${creditsPreview} credits`
            : `Add ${currencySymbol}${amountRupees} to wallet`,
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
          <LinearGradient
            colors={gradients.primaryButton}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.successIcon}
          >
            <CircleCheck size={40} color={colors.onGradientText} />
          </LinearGradient>
          <AppText variant="displayMd" style={styles.centerText}>
            Top-up successful
          </AppText>
          <AppText variant="displayLg" color={colors.primary}>
            +{formatCredits(successCredits)} credits
          </AppText>
          <AppText variant="body" color={colors.textSecondary} style={styles.centerText}>
            New balance: {profile ? formatCredits(profile.credits) : '—'} credits
          </AppText>
          <Button label="Done" onPress={goBack} style={styles.successButton} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.headerRow}>
        <Pressable onPress={goBack} style={styles.backButton} hitSlop={8}>
          <ArrowLeft size={18} color={colors.textPrimary} />
        </Pressable>
        <AppText variant="displayMd" style={styles.headerTitle}>
          Wallet
        </AppText>
      </View>

      <LinearGradient
        colors={gradients.primaryButton}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.heroLabelRow}>
          <View style={styles.heroIcon}>
            <Wallet size={16} color={colors.onGradientText} />
          </View>
          <AppText variant="bodySmall" color={colors.onGradientText} style={styles.heroLabel}>
            WALLET BALANCE
          </AppText>
        </View>
        <View style={styles.heroBalanceRow}>
          <AppText variant="displayLg" color={colors.onGradientText} style={styles.heroBalance}>
            {profile ? formatCredits(profile.credits) : '—'}
          </AppText>
          <AppText variant="label" color={colors.onGradientText} style={styles.heroBalanceUnit}>
            credits
          </AppText>
        </View>
        {rupeesPerCredit != null ? (
          <View style={styles.ratePill}>
            <Zap size={14} color={colors.primary} fill={colors.primary} />
            <AppText variant="bodySmall" color={colors.textSecondary}>
              Current rate
            </AppText>
            <AppText variant="label" color={colors.primary}>
              {formatRate(rupeesPerCredit, currencySymbol)}
            </AppText>
          </View>
        ) : null}
        <AppText variant="caption" color={colors.onGradientText} style={styles.heroHint}>
          {reportAmount
            ? `Use credits for astrologer chats and the ${currencySymbol}${reportAmount} kundali unlock.`
            : 'Use credits for astrologer chats. Cannot be withdrawn or transferred.'}
        </AppText>
      </LinearGradient>

      {profile && !canTopUp ? (
        <Card style={styles.lockedCard}>
          <View style={styles.lockedIcon}>
            <Lock size={22} color={colors.primary} />
          </View>
          <AppText variant="cardTitle" style={styles.centerText}>
            Recharge is for trial & Plus members
          </AppText>
          <AppText variant="bodySmall" color={colors.textSecondary} style={styles.centerText}>
            Start your plan to unlock wallet recharges and keep chatting with astrologers.
          </AppText>
          <Button
            label={profile.trialCreditsClaimed ? 'Subscribe' : 'Start trial'}
            onPress={() => router.push(getPaywallRoute(profile))}
            icon={<ArrowRight size={16} color={colors.onGradientText} />}
            style={styles.fullWidth}
          />
        </Card>
      ) : config ? (
        <>
          <AppText variant="label" color={colors.primary} style={styles.sectionLabel}>
            CHOOSE AMOUNT
          </AppText>
          <View style={styles.presetGrid}>
            {config.presetAmounts.map((rupees) => {
              const active = selectedAmount === rupees;
              return (
                <Pressable
                  key={rupees}
                  onPress={() => handleSelectPreset(rupees)}
                  style={[styles.presetTile, active && styles.presetTileActive]}
                >
                  {rupees === largestPreset ? (
                    <View style={styles.bestTag}>
                      <AppText variant="caption" color={colors.onGradientText} style={styles.bestTagText}>
                        BEST VALUE
                      </AppText>
                    </View>
                  ) : null}
                  {active ? (
                    <View style={styles.checkBadge}>
                      <Check size={12} color={colors.onGradientText} strokeWidth={3} />
                    </View>
                  ) : null}
                  <AppText variant="displayMd" color={colors.textPrimary} style={styles.presetAmount}>
                    {currencySymbol}
                    {rupees.toLocaleString('en-IN')}
                  </AppText>
                  {rupeesPerCredit != null ? (
                    <View style={styles.presetCreditsRow}>
                      <Coins size={13} color={colors.primary} />
                      <AppText variant="bodySmall" color={colors.primary} style={styles.presetCredits}>
                        {formatCredits(creditsFor(rupees, rupeesPerCredit))} credits
                      </AppText>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <Input
            value={customAmount}
            onChangeText={handleCustomAmountChange}
            placeholder="Enter other amount"
            keyboardType="number-pad"
            leftAccessory={
              <AppText variant="label" color={colors.textSecondary}>
                {currencySymbol}
              </AppText>
            }
          />
          <AppText
            variant="caption"
            color={customOutOfRange ? colors.danger : colors.textMuted}
            style={styles.hint}
          >
            {customAmount !== '' && amountValid && creditsPreview != null
              ? `You'll get ${formatCredits(creditsPreview)} credits`
              : `Min ${currencySymbol}${minRupees} · Max ${currencySymbol}${maxRupees}`}
          </AppText>

          {amountRupees != null && amountValid ? (
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryCol}>
                  <AppText variant="caption" color={colors.textSecondary} style={styles.summaryLabel}>
                    YOU PAY
                  </AppText>
                  <AppText variant="cardTitle">
                    {currencySymbol}
                    {amountRupees.toLocaleString('en-IN')}
                  </AppText>
                </View>
                <View style={styles.summaryArrow}>
                  <ArrowRight size={16} color={colors.primary} />
                </View>
                <View style={[styles.summaryCol, styles.summaryColEnd]}>
                  <AppText variant="caption" color={colors.textSecondary} style={styles.summaryLabel}>
                    YOU GET
                  </AppText>
                  <AppText variant="cardTitle" color={colors.primary}>
                    {creditsPreview != null ? `${formatCredits(creditsPreview)} credits` : '—'}
                  </AppText>
                </View>
              </View>
              {profile && creditsPreview != null ? (
                <View style={styles.summaryFooter}>
                  <AppText variant="bodySmall" color={colors.textSecondary}>
                    New balance
                  </AppText>
                  <AppText variant="label">{formatCredits(profile.credits + creditsPreview)} credits</AppText>
                </View>
              ) : null}
            </View>
          ) : null}

          <Button
            label={
              amountValid && amountRupees != null
                ? creditsPreview != null
                  ? `Add ${currencySymbol}${amountRupees.toLocaleString('en-IN')} · ${formatCredits(creditsPreview)} credits`
                  : `Add ${currencySymbol}${amountRupees.toLocaleString('en-IN')}`
                : 'Select an amount'
            }
            onPress={handlePay}
            loading={processing}
            disabled={!amountValid}
            style={styles.payButton}
          />

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
        <View style={styles.emptyState}>
          <AppText variant="bodySmall" color={colors.textSecondary} style={styles.centerText}>
            {historyError ? 'Could not load activity.' : 'No recharges yet. Your top-ups will show up here.'}
          </AppText>
        </View>
      ) : (
        <View style={styles.activityList}>
          {history.map((item) => (
            <View key={item.id} style={styles.activityRow}>
              <View style={styles.activityIcon}>
                <ArrowDownLeft size={18} color={colors.primary} />
              </View>
              <View style={styles.activityText}>
                <AppText variant="label">Wallet recharge</AppText>
                <AppText variant="caption" color={colors.textSecondary}>
                  {formatDateTime(item.createdAt)}
                </AppText>
              </View>
              <View style={styles.activityAmount}>
                <AppText variant="label" color={colors.primary}>
                  +{formatCredits(item.creditsAwarded)} credits
                </AppText>
                <AppText variant="caption" color={colors.textSecondary}>
                  {currencySymbol}
                  {item.amount.toLocaleString('en-IN')} paid
                </AppText>
              </View>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontFamily: fonts.display },
  heroCard: {
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadows.card,
  },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  heroIcon: {
    width: 30,
    height: 30,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: { letterSpacing: 1.5, opacity: 0.9 },
  heroBalanceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  heroBalance: { fontSize: 44, lineHeight: 50 },
  heroBalanceUnit: { marginBottom: spacing.sm, opacity: 0.9 },
  ratePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs + 2,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
  heroHint: { opacity: 0.85 },
  lockedCard: {
    marginTop: spacing.xl,
    gap: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  lockedIcon: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: { alignSelf: 'stretch' },
  centerText: { textAlign: 'center' },
  sectionLabel: { marginTop: spacing.xl, marginBottom: spacing.md, letterSpacing: 1 },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  presetTile: {
    width: '47%',
    flexGrow: 1,
    minHeight: 88,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    ...shadows.card,
  },
  presetTileActive: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.surfaceAlt,
  },
  presetAmount: { fontSize: 26, lineHeight: 30 },
  presetCreditsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  presetCredits: { fontFamily: fonts.bodySemiBold },
  bestTag: {
    position: 'absolute',
    top: -9,
    alignSelf: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  bestTagText: { fontFamily: fonts.bodyBold, letterSpacing: 0.8 },
  checkBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 20,
    height: 20,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { marginTop: spacing.xs },
  summaryCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceAlt,
    padding: spacing.lg,
    gap: spacing.md,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryCol: { flex: 1, gap: 2 },
  summaryColEnd: { alignItems: 'flex-end' },
  summaryLabel: { letterSpacing: 1 },
  summaryArrow: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  payButton: { marginTop: spacing.lg },
  error: { marginTop: spacing.md },
  activityTitle: { marginTop: spacing.xxl, marginBottom: spacing.md, letterSpacing: 1 },
  emptyState: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    padding: spacing.lg,
  },
  activityList: { gap: spacing.sm },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityText: { flex: 1, gap: 2 },
  activityAmount: { alignItems: 'flex-end', gap: 2 },
  bottomSpace: { height: spacing.xxl },
  successContainer: { flex: 1, justifyContent: 'center', gap: spacing.md, alignItems: 'center' },
  successIcon: {
    width: 84,
    height: 84,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  successButton: { alignSelf: 'stretch', marginTop: spacing.lg },
});
