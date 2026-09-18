import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Crown, FileText, LogOut, Settings, Wallet } from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Card } from '@/components/cards/Card';
import { Screen } from '@/components/common/Screen';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { colors, radii, spacing } from '@/constants/theme';

export default function ProfileScreen() {
  const { profile, signOut } = useAuth();

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AppText variant="displayMd">Profile</AppText>
      </View>

      <Card style={styles.infoCard}>
        <AppText variant="cardTitle">{profile?.name ?? 'Add your name'}</AppText>
        <AppText variant="body" color={colors.textSecondary}>
          {profile?.phoneNumber}
        </AppText>
        <View style={styles.divider} />
        <ProfileRow label="Date of birth" value={profile?.dateOfBirth ?? '—'} />
        <ProfileRow label="Time of birth" value={profile?.timeOfBirth ?? '—'} />
        <ProfileRow label="Place of birth" value={profile?.placeOfBirth ?? '—'} />
      </Card>

      <Pressable
        style={styles.menuRow}
        onPress={() => router.push(profile?.trialCreditsClaimed ? '/paywall/upgrade' : '/paywall')}
      >
        <Crown size={20} color={colors.primary} />
        <AppText variant="body" style={styles.menuLabel}>
          {profile?.trialCreditsClaimed ? 'Subscribe for more credits' : 'Try Astro101 for Re.1'}
        </AppText>
      </Pressable>

      <Pressable style={styles.menuRow} onPress={() => router.push('/wallet/topup')}>
        <Wallet size={20} color={colors.textSecondary} />
        <AppText variant="body" style={styles.menuLabel}>
          {profile?.credits ?? 0} credits — Top up wallet
        </AppText>
      </Pressable>

      <Pressable style={styles.menuRow} onPress={() => router.push('/report')}>
        <FileText size={20} color={colors.textSecondary} />
        <AppText variant="body" style={styles.menuLabel}>
          My kundali report
        </AppText>
      </Pressable>

      <Pressable style={styles.menuRow} onPress={() => router.push('/settings')}>
        <Settings size={20} color={colors.textSecondary} />
        <AppText variant="body" style={styles.menuLabel}>
          Settings
        </AppText>
      </Pressable>

      <Pressable style={styles.menuRow} onPress={() => signOut()}>
        <LogOut size={20} color={colors.danger} />
        <AppText variant="body" color={colors.danger} style={styles.menuLabel}>
          Log out
        </AppText>
      </Pressable>
    </Screen>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <AppText variant="bodySmall" color={colors.textSecondary}>
        {label}
      </AppText>
      <AppText variant="body">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: spacing.xl, marginBottom: spacing.lg },
  infoCard: { gap: spacing.sm, marginBottom: spacing.xl },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  menuLabel: { flex: 1 },
});
