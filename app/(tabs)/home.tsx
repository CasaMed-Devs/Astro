import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Crown, Sparkles } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { PersonaCard } from '@/features/astrologers/components/PersonaCard';
import { fetchAstrologerProfiles } from '@/services/astrologers.service';
import type { AstrologerProfile } from '@/features/astrologers/types';
import { getPaywallRoute } from '@/utils/paywall';
import { colors, radii, spacing } from '@/constants/theme';

export default function HomeScreen() {
  const { profile } = useAuth();
  const [astrologers, setAstrologers] = useState<AstrologerProfile[]>([]);

  useEffect(() => {
    fetchAstrologerProfiles()
      .then((profiles) => setAstrologers(profiles))
      .catch(() => setAstrologers([]));
  }, []);

  return (
    <Screen edges={['top']} padded={false} scroll>
      <View style={styles.header}>
        <AppText variant="displayMd">Hi{profile?.name ? `, ${profile.name}` : ''}</AppText>
        <AppText variant="body" color={colors.textSecondary}>
          What&apos;s on your mind today?
        </AppText>
      </View>

      <View style={styles.creditsCard}>
        <View>
          <AppText variant="caption" color={colors.textSecondary}>
            Credits
          </AppText>
          <AppText variant="displayMd" color={colors.primary}>
            {profile?.credits ?? 0}
          </AppText>
        </View>
        <Pressable style={styles.upsellButton} onPress={() => router.push(getPaywallRoute(profile))}>
          <Crown size={16} color={colors.onGradientText} />
          <AppText variant="buttonLabel" color={colors.onGradientText}>
            {profile?.trialCreditsClaimed ? 'Add credits' : 'Try for Re.1'}
          </AppText>
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Sparkles size={18} color={colors.primary} />
        <AppText variant="cardTitle">Astrologers</AppText>
      </View>

      <FlatList
        data={astrologers}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        renderItem={({ item }) => (
          <PersonaCard persona={item} onPress={() => router.push(`/astrologer/${item.id}`)} />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, gap: spacing.xs, marginTop: spacing.md },
  creditsCard: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  upsellButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    height: 36,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  listContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
});
