import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Check, Crown, X } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/buttons/Button';
import { Screen } from '@/components/common/Screen';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { getDefaultPlan } from '@/features/payments/config/plans';
import { fetchAstrologerProfiles } from '@/services/astrologers.service';
import type { AstrologerProfile } from '@/features/astrologers/types';
import {
  createSubscriptionOrder,
  openRazorpayCheckout,
  verifySubscriptionPayment,
} from '@/services/payment.service';
import { colors, radii, spacing } from '@/constants/theme';
import { AppError } from '@/utils/errors';

export default function PaywallScreen() {
  const { session } = useAuth();
  const plan = getDefaultPlan();
  const pricingReady = plan.price != null && plan.currency != null;
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarPersonas, setAvatarPersonas] = useState<AstrologerProfile[]>([]);

  useEffect(() => {
    fetchAstrologerProfiles()
      .then((profiles) => setAvatarPersonas(profiles.slice(0, 6)))
      .catch(() => setAvatarPersonas([]));
  }, []);

  const handleSubscribe = async () => {
    if (!pricingReady) return;
    setProcessing(true);
    setError(null);
    try {
      const order = await createSubscriptionOrder(plan.id);
      const result = await openRazorpayCheckout(order, {
        name: 'Astro101 Plus',
        description: plan.name,
        contact: session?.phoneNumber ?? undefined,
      });
      await verifySubscriptionPayment(result);
      router.back();
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Could not complete the subscription.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Screen scroll>
      <Pressable onPress={() => router.back()} style={styles.closeButton}>
        <X size={18} color={colors.textPrimary} />
      </Pressable>

      <View style={styles.header}>
        <View style={styles.badge}>
          <Crown size={16} color={colors.primary} />
          <AppText variant="label" color={colors.primary}>
            ASTRO101 PLUS
          </AppText>
        </View>
        <AppText variant="displayMd">Chat more, worry less</AppText>
        <AppText variant="bodySmall" color={colors.textSecondary}>
          Members get unlimited AI astrologer messages and priority responses.
        </AppText>
      </View>

      <View style={styles.features}>
        {plan.features.map((feature) => (
          <View key={feature} style={styles.featureRow}>
            <Check size={16} color={colors.primary} />
            <AppText variant="label" color={colors.textSecondary} style={styles.featureText}>
              {feature}
            </AppText>
          </View>
        ))}
      </View>

      <View style={styles.avatarStrip}>
        {avatarPersonas.map((persona) => (
          <Image key={persona.id} source={{ uri: persona.photoUrl }} style={styles.avatar} />
        ))}
      </View>
      <AppText variant="bodySmall" color={colors.textSecondary} style={styles.avatarCaption}>
        Kundali, tarot & palmistry AI personas ready to read your chart
      </AppText>

      {pricingReady ? (
        <View style={styles.priceCard}>
          <View>
            <AppText variant="cardTitle">
              {plan.trialDays ? `${plan.trialDays}-day trial` : plan.name}
            </AppText>
            <AppText variant="bodySmall" color={colors.textSecondary}>
              Then {plan.currency}
              {plan.price}/{plan.billingPeriod === 'monthly' ? 'month' : 'year'} · Cancel anytime
            </AppText>
          </View>
          <AppText variant="displayMd" color={colors.primaryDark}>
            {plan.currency}
            {plan.price}
          </AppText>
        </View>
      ) : (
        <View style={styles.priceCard}>
          <AppText variant="cardTitle">Pricing coming soon</AppText>
          <AppText variant="bodySmall" color={colors.textSecondary}>
            We&apos;re finalizing Astro101 Plus pricing. Check back shortly.
          </AppText>
        </View>
      )}

      {error ? (
        <AppText variant="bodySmall" color={colors.danger} style={styles.error}>
          {error}
        </AppText>
      ) : null}

      <View style={styles.footer}>
        <Button
          label={plan.trialDays ? `Start ${plan.trialDays}-day trial` : 'Subscribe'}
          onPress={handleSubscribe}
          loading={processing}
          disabled={!pricingReady}
        />
        <Pressable onPress={() => router.back()}>
          <AppText variant="body" color={colors.textSecondary} style={styles.skipLabel}>
            Continue without trial
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
  avatarStrip: { flexDirection: 'row', marginTop: spacing.xl },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    marginLeft: -12,
    borderWidth: 2,
    borderColor: colors.surfaceMuted,
  },
  avatarCaption: { marginTop: spacing.sm },
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
  error: { marginTop: spacing.md },
  footer: { marginTop: spacing.xl, marginBottom: spacing.xxl, gap: spacing.md },
  skipLabel: { textAlign: 'center' },
});
