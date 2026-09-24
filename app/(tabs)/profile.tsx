import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
  Crown,
  FileText,
  LogOut,
  Pencil,
  Receipt,
  Settings,
  ShieldCheck,
  Trash2,
  Wallet,
} from 'lucide-react-native';

import { AppText } from '@/components/common/AppText';
import { Card } from '@/components/cards/Card';
import { Screen } from '@/components/common/Screen';
import { useAuth } from '@/features/auth/context/AuthProvider';
import { getPaywallRoute } from '@/utils/paywall';
import { showErrorToast } from '@/utils/toast';
import { colors, radii, spacing } from '@/constants/theme';

const PRIVACY_POLICY_URL = 'https://houseoftech-legal.web.app/astro108/privacy';
const TERMS_URL = 'https://houseoftech-legal.web.app/astro108/terms';
const PAYMENT_CANCELLATION_URL =
  'https://houseoftech-legal.web.app/astro108/payment-cancellation';
const DELETE_ACCOUNT_POLICY_URL = 'https://houseoftech-legal.web.app/astro108/delete-account';

export default function ProfileScreen() {
  const { profile, signOut } = useAuth();

  const handleSignOut = () => {
    showErrorToast('Successfully logout');
    signOut();
  };

  return (
    <Screen edges={['top']} scroll>
      <View style={styles.header}>
        <AppText variant="displayMd">Profile</AppText>
      </View>

      <Card style={styles.infoCard}>
        <View style={styles.infoCardHeader}>
          <AppText variant="cardTitle">{profile?.name ?? 'Add your name'}</AppText>
          <Pressable
            hitSlop={8}
            onPress={() => router.push('/profile/edit')}
            style={styles.editButton}
          >
            <Pencil size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
        <AppText variant="body" color={colors.textSecondary}>
          {profile?.phoneNumber}
        </AppText>
        <View style={styles.divider} />
        <ProfileRow label="Date of birth" value={profile?.dateOfBirth ?? '—'} />
        <ProfileRow label="Time of birth" value={profile?.timeOfBirth ?? '—'} />
        <ProfileRow label="Place of birth" value={profile?.placeOfBirth ?? '—'} />
      </Card>

      <Pressable style={styles.menuRow} onPress={() => router.push(getPaywallRoute(profile))}>
        <Crown size={20} color={colors.primary} />
        <AppText variant="body" style={styles.menuLabel}>
          {profile?.trialCreditsClaimed ? 'Subscribe for more credits' : 'Try Astro101 for Rs.1'}
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

      <Pressable style={styles.menuRow} onPress={() => Linking.openURL(TERMS_URL)}>
        <FileText size={20} color={colors.textSecondary} />
        <AppText variant="body" style={styles.menuLabel}>
          Terms and conditions
        </AppText>
      </Pressable>

      <Pressable style={styles.menuRow} onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
        <ShieldCheck size={20} color={colors.textSecondary} />
        <AppText variant="body" style={styles.menuLabel}>
          Privacy policy
        </AppText>
      </Pressable>

      <Pressable style={styles.menuRow} onPress={() => Linking.openURL(PAYMENT_CANCELLATION_URL)}>
        <Receipt size={20} color={colors.textSecondary} />
        <AppText variant="body" style={styles.menuLabel}>
          Payment and cancellation policy
        </AppText>
      </Pressable>

      <Pressable style={styles.menuRow} onPress={() => Linking.openURL(DELETE_ACCOUNT_POLICY_URL)}>
        <Trash2 size={20} color={colors.textSecondary} />
        <AppText variant="body" style={styles.menuLabel}>
          Account deletion policy
        </AppText>
      </Pressable>

      <Pressable style={styles.menuRow} onPress={handleSignOut}>
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
  infoCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editButton: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
